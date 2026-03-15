// K9 Operations — Cash Tips Tracker
// Track cash tip entries per employee per day with summary views.

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import { C, todayStr, addDays, fmtDateShort } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Btn, Card, Inp } from "../../shared/ui";

const fmt$ = (v) => "$" + (typeof v === "number" ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00");

const RANGES = [
  { key: "today",     label: "Today" },
  { key: "this-week", label: "This Week" },
  { key: "this-month",label: "This Month" },
  { key: "custom",    label: "Custom" },
];

export default function CashTipsPage({ data, save, nav, profile, addGlobalToast }) {
  const locationId = profile?.location_id || "11111111-1111-1111-1111-111111111111";
  const today = todayStr();

  // ─── State ──────────────────────────────────────────────────────────
  const [tips, setTips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("today");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);

  // Form state
  const [empName, setEmpName] = useState("");
  const [amount, setAmount] = useState("");
  const [tipDate, setTipDate] = useState(today);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editId, setEditId] = useState(null);
  const [editEmpName, setEditEmpName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");

  // Sort
  const [sortCol, setSortCol] = useState("tip_date");
  const [sortDir, setSortDir] = useState("desc");

  // ─── Date range calculation ─────────────────────────────────────────
  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date();
    if (range === "today") return { dateFrom: today, dateTo: today };
    if (range === "this-week") {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday start
      const start = addDays(today, -diff);
      return { dateFrom: start, dateTo: today };
    }
    if (range === "this-month") {
      const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      return { dateFrom: start, dateTo: today };
    }
    // custom
    return { dateFrom: customFrom, dateTo: customTo };
  }, [range, today, customFrom, customTo]);

  // ─── Fetch tips ─────────────────────────────────────────────────────
  const fetchTips = useCallback(async () => {
    setLoading(true);
    const { data: rows, error } = await supabase
      .from("cash_tips")
      .select("*")
      .eq("location_id", locationId)
      .gte("tip_date", dateFrom)
      .lte("tip_date", dateTo)
      .order("tip_date", { ascending: false });
    if (error) {
      console.log("[CashTips] Fetch error:", error.message);
      addGlobalToast?.("Failed to load tips", "error");
    } else {
      setTips(rows || []);
    }
    setLoading(false);
  }, [locationId, dateFrom, dateTo, addGlobalToast]);

  useEffect(() => { fetchTips(); }, [fetchTips]);

  // ─── Add tip ────────────────────────────────────────────────────────
  const handleAdd = async () => {
    const parsedAmt = parseFloat(amount);
    if (!empName.trim() || isNaN(parsedAmt) || parsedAmt <= 0) {
      addGlobalToast?.("Enter employee name and a valid amount", "warning");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("cash_tips").insert({
      location_id: locationId,
      employee_name: empName.trim(),
      amount: parsedAmt,
      tip_date: tipDate,
      note: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      console.log("[CashTips] Insert error:", error.message);
      addGlobalToast?.("Failed to save tip", "error");
    } else {
      addGlobalToast?.("Tip added", "success");
      setEmpName("");
      setAmount("");
      setNote("");
      fetchTips();
    }
  };

  // ─── Update tip ─────────────────────────────────────────────────────
  const handleUpdate = async () => {
    const parsedAmt = parseFloat(editAmount);
    if (!editEmpName.trim() || isNaN(parsedAmt) || parsedAmt <= 0) {
      addGlobalToast?.("Enter employee name and a valid amount", "warning");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("cash_tips").update({
      employee_name: editEmpName.trim(),
      amount: parsedAmt,
      tip_date: editDate,
      note: editNote.trim() || null,
    }).eq("id", editId);
    setSaving(false);
    if (error) {
      console.log("[CashTips] Update error:", error.message);
      addGlobalToast?.("Failed to update tip", "error");
    } else {
      addGlobalToast?.("Tip updated", "success");
      setEditId(null);
      fetchTips();
    }
  };

  // ─── Delete tip ─────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    const { error } = await supabase.from("cash_tips").delete().eq("id", id);
    if (error) {
      console.log("[CashTips] Delete error:", error.message);
      addGlobalToast?.("Failed to delete tip", "error");
    } else {
      addGlobalToast?.("Tip deleted", "success");
      fetchTips();
    }
  };

  // ─── Summary by employee ────────────────────────────────────────────
  const employeeSummary = useMemo(() => {
    const map = {};
    tips.forEach(t => {
      if (!map[t.employee_name]) map[t.employee_name] = { name: t.employee_name, total: 0, count: 0 };
      map[t.employee_name].total += Number(t.amount);
      map[t.employee_name].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [tips]);

  const totalAmount = tips.reduce((s, t) => s + Number(t.amount), 0);

  // ─── Sorted tips ────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const arr = [...tips];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortCol === "tip_date") cmp = a.tip_date.localeCompare(b.tip_date);
      else if (sortCol === "employee_name") cmp = a.employee_name.localeCompare(b.employee_name);
      else if (sortCol === "amount") cmp = Number(a.amount) - Number(b.amount);
      else if (sortCol === "note") cmp = (a.note || "").localeCompare(b.note || "");
      return sortDir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [tips, sortCol, sortDir]);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const sortIndicator = (col) => {
    if (sortCol !== col) return "";
    return sortDir === "asc" ? " \u2191" : " \u2193";
  };

  // ─── Table styles ───────────────────────────────────────────────────
  const thStyle = (col) => ({
    padding: "8px 12px", textAlign: col === "amount" ? "right" : "left",
    fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase",
    letterSpacing: "0.06em", cursor: "pointer", userSelect: "none",
    borderBottom: `2px solid ${sortCol === col ? C.pri : C.border}`,
    background: sortCol === col ? `${C.pri}06` : "transparent",
    transition: "all 0.15s", whiteSpace: "nowrap",
  });

  const tdStyle = (col) => ({
    padding: "10px 12px", fontSize: 12, fontWeight: col === "amount" ? 700 : 500,
    color: col === "amount" ? C.suc : C.text,
    textAlign: col === "amount" ? "right" : "left",
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    maxWidth: col === "note" ? 240 : "unset",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: "inherit" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0, lineHeight: 1 }}>Cash Tips</h1>
          <span style={{
            fontSize: 11, fontWeight: 700, color: C.suc,
            background: C.sucLt, padding: "2px 8px", borderRadius: 6,
          }}>
            {fmt$(totalAmount)} &middot; {tips.length} entr{tips.length !== 1 ? "ies" : "y"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              style={{
                padding: "3px 8px", borderRadius: 6,
                border: `1px solid ${range === r.key ? C.pri : C.border}`,
                background: range === r.key ? C.pri : "transparent",
                color: range === r.key ? "#fff" : C.textMut,
                fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                transition: "all 0.12s", lineHeight: 1.4,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom date range */}
      {range === "custom" && (
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: C.textSec }}>From</label>
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", background: C.surface, color: C.text }} />
          <label style={{ fontSize: 12, fontWeight: 600, color: C.textSec }}>To</label>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", background: C.surface, color: C.text }} />
        </div>
      )}

      {/* Add Tip Form */}
      <div style={{
        display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap",
        padding: 16, borderRadius: 12, background: C.surface,
        border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <div style={{ flex: "1 1 160px", minWidth: 140 }}>
          <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Employee</label>
          <input
            type="text" value={empName} onChange={e => setEmpName(e.target.value)}
            placeholder="Employee name"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", background: C.bg, color: C.text, boxSizing: "border-box" }}
          />
        </div>
        <div style={{ flex: "0 1 120px", minWidth: 100 }}>
          <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Amount ($)</label>
          <input
            type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0.00" min="0" step="0.01"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", background: C.bg, color: C.text, boxSizing: "border-box" }}
          />
        </div>
        <div style={{ flex: "0 1 140px", minWidth: 120 }}>
          <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Date</label>
          <input
            type="date" value={tipDate} onChange={e => setTipDate(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", background: C.bg, color: C.text, boxSizing: "border-box" }}
          />
        </div>
        <div style={{ flex: "1 1 180px", minWidth: 140 }}>
          <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Note (optional)</label>
          <input
            type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder="Optional note"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", background: C.bg, color: C.text, boxSizing: "border-box" }}
          />
        </div>
        <Btn variant="primary" onClick={handleAdd} disabled={saving} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
          {saving ? "Saving..." : "Add Tip"}
        </Btn>
      </div>

      {/* Summary Cards */}
      {employeeSummary.length > 0 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {employeeSummary.map(emp => (
            <div key={emp.name} style={{
              flex: "1 1 180px", maxWidth: 240, padding: "14px 16px", borderRadius: 12,
              background: C.surface, border: `1px solid ${C.border}`,
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{emp.name}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.suc }}>{fmt$(emp.total)}</div>
              <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>{emp.count} tip{emp.count !== 1 ? "s" : ""}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tips Table */}
      <div style={{
        borderRadius: 12, border: `1px solid ${C.border}`, background: C.surface,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)", overflow: "auto",
      }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: C.textMut, fontSize: 13 }}>Loading tips...</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2, background: C.surface }}>
              <tr>
                <th style={thStyle("tip_date")} onClick={() => toggleSort("tip_date")}>Date{sortIndicator("tip_date")}</th>
                <th style={thStyle("employee_name")} onClick={() => toggleSort("employee_name")}>Employee{sortIndicator("employee_name")}</th>
                <th style={thStyle("amount")} onClick={() => toggleSort("amount")}>Amount{sortIndicator("amount")}</th>
                <th style={thStyle("note")} onClick={() => toggleSort("note")}>Note{sortIndicator("note")}</th>
                <th style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `2px solid ${C.border}`, textAlign: "center", width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 40, textAlign: "center", color: C.textMut, fontSize: 13, fontStyle: "italic" }}>
                    No tips found for this period
                  </td>
                </tr>
              )}
              {sorted.map(tip => (
                editId === tip.id ? (
                  <tr key={tip.id} style={{ background: `${C.pri}08` }}>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}` }}>
                      <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                        style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", background: C.bg, color: C.text, width: 130 }} />
                    </td>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}` }}>
                      <input type="text" value={editEmpName} onChange={e => setEditEmpName(e.target.value)}
                        style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", background: C.bg, color: C.text, width: "100%" }} />
                    </td>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>
                      <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} min="0" step="0.01"
                        style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", background: C.bg, color: C.text, width: 90, textAlign: "right" }} />
                    </td>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}` }}>
                      <input type="text" value={editNote} onChange={e => setEditNote(e.target.value)}
                        style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", background: C.bg, color: C.text, width: "100%" }} />
                    </td>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}`, textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button onClick={handleUpdate} disabled={saving}
                          style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: C.suc, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                          Save
                        </button>
                        <button onClick={() => setEditId(null)}
                          style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textMut, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={tip.id}
                    style={{ transition: "background 0.1s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = `${C.pri}04`; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                    <td style={tdStyle("tip_date")}>{fmtDateShort(tip.tip_date)}</td>
                    <td style={{ ...tdStyle("employee_name"), fontWeight: 600 }}>{tip.employee_name}</td>
                    <td style={tdStyle("amount")}>{fmt$(Number(tip.amount))}</td>
                    <td style={{ ...tdStyle("note"), color: C.textSec }}>{tip.note || "\u2014"}</td>
                    <td style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button
                          onClick={() => { setEditId(tip.id); setEditEmpName(tip.employee_name); setEditAmount(String(tip.amount)); setEditDate(tip.tip_date); setEditNote(tip.note || ""); }}
                          style={{ padding: "3px 6px", borderRadius: 4, border: "none", background: "transparent", color: C.pri, cursor: "pointer", display: "flex", alignItems: "center" }}
                          title="Edit">
                          <I.Edit />
                        </button>
                        <button
                          onClick={() => handleDelete(tip.id)}
                          style={{ padding: "3px 6px", borderRadius: 4, border: "none", background: "transparent", color: C.dan, cursor: "pointer", display: "flex", alignItems: "center" }}
                          title="Delete">
                          <I.Trash />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
