// K9 Operations — Refunds Detail Page
// Expand target from Dashboard Refund Tracker module.
// Table view: Date, Client, Amount, Reason, Processed By

import React, { useState, useMemo } from "react";
import { C, todayStr, addDays, fmtDateShort } from "../../shared/theme";
import { I } from "../../shared/icons";

const fmt$ = (v) => "$" + (typeof v === "number" ? Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00");

const RANGES = [
  { key: "past-week", label: "Past Week" },
  { key: "mtd",       label: "MTD" },
  { key: "past-30",   label: "Past 30" },
  { key: "qtd",       label: "QTD" },
  { key: "ytd",       label: "YTD" },
  { key: "lifetime",  label: "Lifetime" },
];

export default function RefundsPage({ data, nav, profile }) {
  const [range, setRange] = useState("mtd");
  const [sortCol, setSortCol] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const today = todayStr();

  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date();
    const end = today;
    let start;
    switch (range) {
      case "past-week": start = addDays(today, -7); break;
      case "mtd": start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`; break;
      case "past-30": start = addDays(today, -30); break;
      case "qtd": {
        const qm = Math.floor(now.getMonth() / 3) * 3;
        start = `${now.getFullYear()}-${String(qm + 1).padStart(2, "0")}-01`; break;
      }
      case "ytd": start = `${now.getFullYear()}-01-01`; break;
      case "lifetime": start = "2020-01-01"; break;
      default: start = addDays(today, -30);
    }
    return { dateFrom: start, dateTo: end };
  }, [range, today]);

  const refunds = useMemo(() => {
    const reservations = data.reservations || [];
    const clients = data.clients || [];
    const rows = [];
    reservations.forEach(res => {
      if (res.checkIn < dateFrom || res.checkIn > dateTo) return;
      const refundAmt = res.pricing?.refund || res.pricing?.refundAmount || 0;
      if (refundAmt <= 0) return;
      const client = clients.find(c => c.id === res.clientId);
      const clientName = client
        ? `${client.fields?.first_name || ""} ${client.fields?.last_name || ""}`.trim()
        : "Unknown";
      rows.push({
        id: res.id,
        date: res.checkIn,
        clientName,
        clientId: res.clientId,
        amount: refundAmt,
        reason: res.pricing?.refundReason || res.cancellationReason || "—",
        processedBy: res.pricing?.refundProcessedBy || res._modifiedBy || "—",
      });
    });
    return rows;
  }, [data, dateFrom, dateTo]);

  const sorted = useMemo(() => {
    const arr = [...refunds];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortCol === "date") cmp = a.date.localeCompare(b.date);
      else if (sortCol === "client") cmp = a.clientName.localeCompare(b.clientName);
      else if (sortCol === "amount") cmp = a.amount - b.amount;
      else if (sortCol === "reason") cmp = String(a.reason).localeCompare(String(b.reason));
      else if (sortCol === "processedBy") cmp = String(a.processedBy).localeCompare(String(b.processedBy));
      return sortDir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [refunds, sortCol, sortDir]);

  const totalRefunds = refunds.reduce((sum, r) => sum + r.amount, 0);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const thStyle = (col) => ({
    padding: "8px 12px", textAlign: col === "amount" ? "right" : "left",
    fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase",
    letterSpacing: "0.06em", cursor: "pointer", userSelect: "none",
    borderBottom: `2px solid ${sortCol === col ? C.pri : C.borderLight}`,
    background: sortCol === col ? `${C.pri}06` : "transparent",
    transition: "all 0.15s", whiteSpace: "nowrap",
  });

  const tdStyle = (col) => ({
    padding: "10px 12px", fontSize: 12, fontWeight: col === "amount" ? 700 : 500,
    color: col === "amount" ? C.dan : C.text,
    textAlign: col === "amount" ? "right" : "left",
    borderBottom: `1px solid ${C.borderLight}`,
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    maxWidth: col === "reason" ? 240 : "unset",
  });

  const sortIndicator = (col) => {
    if (sortCol !== col) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  return (
    <div style={{
      height: "calc(100vh - 64px)", display: "flex", flexDirection: "column",
      overflow: "hidden", fontFamily: "inherit",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 0 12px 0", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0, lineHeight: 1 }}>Refunds</h1>
          <span style={{
            fontSize: 11, fontWeight: 700, color: C.dan,
            background: C.danLt, padding: "2px 8px", borderRadius: 6,
          }}>
            {fmt$(totalRefunds)} · {refunds.length} refund{refunds.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              style={{
                padding: "3px 8px", borderRadius: 6,
                border: `1px solid ${range === r.key ? C.pri : C.borderLight}`,
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

      {/* Table */}
      <div style={{
        flex: 1, overflow: "auto", borderRadius: 12,
        border: `1px solid ${C.borderLight}`, background: C.surface,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2, background: C.surface }}>
            <tr>
              <th style={thStyle("date")} onClick={() => toggleSort("date")}>Date{sortIndicator("date")}</th>
              <th style={thStyle("client")} onClick={() => toggleSort("client")}>Client{sortIndicator("client")}</th>
              <th style={thStyle("amount")} onClick={() => toggleSort("amount")}>Amount{sortIndicator("amount")}</th>
              <th style={thStyle("reason")} onClick={() => toggleSort("reason")}>Reason{sortIndicator("reason")}</th>
              <th style={thStyle("processedBy")} onClick={() => toggleSort("processedBy")}>Processed By{sortIndicator("processedBy")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} style={{
                  padding: 40, textAlign: "center", color: C.textMut, fontSize: 13,
                  fontStyle: "italic",
                }}>
                  No refunds found in this period
                </td>
              </tr>
            )}
            {sorted.map((row, idx) => (
              <tr
                key={row.id}
                style={{
                  transition: "background 0.1s", cursor: "pointer",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = `${C.pri}04`; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                onClick={() => {
                  if (row.clientId && nav) nav("client-detail", { clientId: row.clientId });
                }}
              >
                <td style={tdStyle("date")}>{fmtDateShort(row.date)}</td>
                <td style={{ ...tdStyle("client"), color: C.pri, fontWeight: 600 }}>{row.clientName}</td>
                <td style={tdStyle("amount")}>{fmt$(row.amount)}</td>
                <td style={tdStyle("reason")}>{row.reason}</td>
                <td style={tdStyle("processedBy")}>{row.processedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
