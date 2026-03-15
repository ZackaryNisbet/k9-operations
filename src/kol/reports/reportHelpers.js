// K9 Operations — Daily Email Report Helpers
// Data aggregation + premium HTML email generation for OPS-013

import { OPS_TYPES, DEF_LITE_EOD_TEMPLATE, todayStr, addDays } from "../../shared/theme";

// ─── Default Report Config ─────────────────────────────────────────────────
export function getDefaultReportConfig() {
  return {
    enabled: false,
    recipients: [],
    sendTime: "20:00",
    sections: {
      facilityStats: true,
      revenue: true,
      checklists: true,
      eodNotes: true,
      tomorrowReservations: true,
    },
  };
}

// ─── Data Aggregation ──────────────────────────────────────────────────────
export function aggregateDailyReport(data, date) {
  const d = date || todayStr();
  const tomorrow = addDays(d, 1);

  // — Facility Stats —
  const reservations = data.reservations || [];
  const rooms = data.rooms || {};

  const activeBoarding = reservations.filter(
    (r) =>
      r.type === "boarding" && (
        (r.status === "checked-in") ||
        (r.status === "upcoming" && (r.scheduledCheckIn || r.checkIn) <= d && (r.scheduledCheckOut || r.checkOut) >= d)
      )
  );
  const activeDaycare = reservations.filter(
    (r) =>
      r.type === "daycare" && (
        (r.status === "checked-in") ||
        (r.status === "upcoming" && (r.scheduledCheckIn || r.checkIn) <= d && (r.scheduledCheckOut || r.checkOut) >= d)
      )
  );
  const attendanceCount = activeBoarding.length + activeDaycare.length;

  // Total capacity from rooms object (keys = room types, values = array of room names)
  let totalCapacity = 0;
  Object.values(rooms).forEach((roomList) => {
    if (Array.isArray(roomList)) totalCapacity += roomList.length;
  });
  const occupancyRate =
    totalCapacity > 0
      ? Math.round((activeBoarding.length / totalCapacity) * 100)
      : 0;

  // — Revenue Summary —
  const dayReservations = reservations.filter(
    (r) =>
      r.checkIn <= d &&
      r.checkOut >= d &&
      r.status !== "cancelled"
  );
  const totalRevenue = dayReservations.reduce(
    (sum, r) => sum + (parseFloat(r._totalCost) || 0),
    0
  );
  const transactionCount = dayReservations.filter(
    (r) => (parseFloat(r._totalCost) || 0) > 0
  ).length;

  // — Checklist Completion —
  const allOps = data.dailyOps || [];
  const checklistTypes = ["opening", "closing", "fe", "be"];
  const checklists = {};
  checklistTypes.forEach((type) => {
    const entryId = `ops_${type}_${d}`;
    const entry = allOps.find((e) => e.id === entryId);
    const items = entry ? entry.items || {} : {};
    const typeDef = OPS_TYPES[type];
    const templateKey = typeDef?.key;

    // Count completed items from whatever items exist
    const itemKeys = Object.keys(items);
    const completed = itemKeys.filter((k) => items[k]?.checked).length;
    const total = itemKeys.length;

    checklists[type] = {
      title: typeDef?.title || type,
      completed,
      total,
      locked: entry?.locked || false,
    };
  });

  // — EOD Highlights —
  const eodEntries = data.eodEntries || [];
  const eodEntry = eodEntries.find((e) => e.id === `eod_${d}` || e.date === d);
  const eodHighlights = [];
  if (eodEntry && eodEntry.sections) {
    eodEntry.sections.forEach((sec) => {
      const content = (sec.content || "").trim();
      if (content) {
        const tmpl = DEF_LITE_EOD_TEMPLATE.find((t) => t.id === sec.id);
        eodHighlights.push({
          id: sec.id,
          title: tmpl?.title || sec.id,
          emoji: tmpl?.emoji || "",
          content,
        });
      }
    });
  }

  // — Tomorrow's Reservations —
  const tomorrowRes = reservations.filter(
    (r) => r.checkIn === tomorrow && r.status !== "cancelled"
  );

  return {
    date: d,
    tomorrow,
    facility: {
      attendanceCount,
      boardingCount: activeBoarding.length,
      daycareCount: activeDaycare.length,
      occupancyRate,
      totalCapacity,
    },
    revenue: {
      total: totalRevenue,
      transactionCount,
    },
    checklists,
    eodHighlights,
    tomorrowReservations: tomorrowRes,
  };
}

// ─── Premium HTML Email Generation ─────────────────────────────────────────
export function generateEmailHTML(reportData, config) {
  const cfg = config || getDefaultReportConfig();
  const sections = cfg.sections || getDefaultReportConfig().sections;
  const d = reportData.date;

  // Format date for display
  const dateObj = new Date(d + "T12:00:00");
  const displayDate = dateObj.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const P = {
    pri: "#003462",
    acc: "#AF8D54",
    bg: "#F5F6F8",
    surface: "#FFFFFF",
    text: "#1A1D23",
    textSec: "#5A6170",
    textMut: "#959BA8",
    border: "#DFE2E8",
    suc: "#0D7A56",
    sucLt: "#ECFDF5",
    warn: "#C4720C",
    warnLt: "#FFFBEB",
  };

  const fmtCurrency = (v) =>
    "$" + Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // — Build sections HTML —
  let body = "";

  // Facility Stats
  if (sections.facilityStats) {
    const f = reportData.facility;
    body += `
    <tr><td style="padding:0 0 8px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:28px 32px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:${P.acc};text-transform:uppercase;letter-spacing:0.1em;padding-bottom:16px;">
                  Facility Overview
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td width="33%" style="padding:0 8px 0 0;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.bg};border-radius:12px;border-collapse:collapse;">
                    <tr><td style="padding:20px;text-align:center;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:36px;font-weight:800;color:${P.pri};line-height:1;">${f.attendanceCount}</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;color:${P.textMut};text-transform:uppercase;letter-spacing:0.05em;margin-top:6px;">Total Guests</div>
                    </td></tr>
                  </table>
                </td>
                <td width="33%" style="padding:0 4px;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.bg};border-radius:12px;border-collapse:collapse;">
                    <tr><td style="padding:20px;text-align:center;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:36px;font-weight:800;color:${P.pri};line-height:1;">${f.occupancyRate}%</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;color:${P.textMut};text-transform:uppercase;letter-spacing:0.05em;margin-top:6px;">Occupancy</div>
                    </td></tr>
                  </table>
                </td>
                <td width="33%" style="padding:0 0 0 8px;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.bg};border-radius:12px;border-collapse:collapse;">
                    <tr><td style="padding:20px;text-align:center;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:36px;font-weight:800;color:${P.pri};line-height:1;">${f.totalCapacity}</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;color:${P.textMut};text-transform:uppercase;letter-spacing:0.05em;margin-top:6px;">Capacity</div>
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;border-collapse:collapse;">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${P.textSec};padding:8px 0;">
                  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${P.pri};margin-right:8px;vertical-align:middle;"></span>
                  Boarding: <strong style="color:${P.text};">${f.boardingCount}</strong>
                  &nbsp;&nbsp;&middot;&nbsp;&nbsp;
                  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${P.acc};margin-right:8px;vertical-align:middle;"></span>
                  Daycare: <strong style="color:${P.text};">${f.daycareCount}</strong>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>`;
  }

  // Revenue Summary
  if (sections.revenue) {
    const r = reportData.revenue;
    body += `
    <tr><td style="padding:0 0 8px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:28px 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:${P.acc};text-transform:uppercase;letter-spacing:0.1em;padding-bottom:16px;">
                  Revenue Summary
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td width="60%" style="padding:0 8px 0 0;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,${P.pri},${P.pri}ee);border-radius:12px;border-collapse:collapse;">
                    <tr><td style="padding:24px;text-align:center;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:rgba(255,255,255,0.7);margin-bottom:4px;">Today's Revenue</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:40px;font-weight:800;color:#FFFFFF;line-height:1;">${fmtCurrency(r.total)}</div>
                    </td></tr>
                  </table>
                </td>
                <td width="40%" style="vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.bg};border-radius:12px;border-collapse:collapse;">
                    <tr><td style="padding:24px;text-align:center;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:36px;font-weight:800;color:${P.pri};line-height:1;">${r.transactionCount}</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;color:${P.textMut};text-transform:uppercase;letter-spacing:0.05em;margin-top:6px;">Transactions</div>
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>`;
  }

  // Checklist Completion
  if (sections.checklists) {
    const cl = reportData.checklists;
    let checklistRows = "";
    Object.keys(cl).forEach((type) => {
      const c = cl[type];
      const pct = c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0;
      const barColor = pct === 100 ? P.suc : pct >= 50 ? P.acc : P.warn;
      const statusColor = pct === 100 ? P.suc : pct >= 50 ? P.acc : P.warn;
      const statusBg = pct === 100 ? P.sucLt : pct >= 50 ? "#FFF9F0" : P.warnLt;
      checklistRows += `
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid ${P.border};">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                    <tr>
                      <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:${P.text};width:45%;">
                        ${c.title}
                      </td>
                      <td style="width:35%;padding:0 12px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                          <tr><td style="background:${P.bg};border-radius:4px;height:8px;">
                            <table width="${pct}%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                              <tr><td style="background:${barColor};border-radius:4px;height:8px;"></td></tr>
                            </table>
                          </td></tr>
                        </table>
                      </td>
                      <td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:${statusColor};text-align:right;white-space:nowrap;">
                        <span style="display:inline-block;padding:3px 10px;border-radius:20px;background:${statusBg};">${c.completed}/${c.total}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`;
    });

    body += `
    <tr><td style="padding:0 0 8px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:28px 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:${P.acc};text-transform:uppercase;letter-spacing:0.1em;padding-bottom:12px;">
                  Checklist Completion
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              ${checklistRows}
            </table>
          </td>
        </tr>
      </table>
    </td></tr>`;
  }

  // EOD Highlights
  if (sections.eodNotes && reportData.eodHighlights.length > 0) {
    let eodRows = "";
    reportData.eodHighlights.forEach((h) => {
      const lines = h.content.split("\n").filter((l) => l.trim()).slice(0, 5);
      const contentHtml = lines
        .map(
          (l) =>
            `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${P.textSec};line-height:1.6;padding:2px 0;">${escapeHtml(l)}</div>`
        )
        .join("");
      eodRows += `
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid ${P.border};">
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:${P.text};margin-bottom:6px;">${h.emoji} ${escapeHtml(h.title)}</div>
                  ${contentHtml}
                </td>
              </tr>`;
    });

    body += `
    <tr><td style="padding:0 0 8px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:28px 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:${P.acc};text-transform:uppercase;letter-spacing:0.1em;padding-bottom:12px;">
                  End-of-Day Highlights
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              ${eodRows}
            </table>
          </td>
        </tr>
      </table>
    </td></tr>`;
  }

  // Tomorrow's Reservations
  if (sections.tomorrowReservations && reportData.tomorrowReservations.length > 0) {
    let resRows = "";
    reportData.tomorrowReservations.forEach((r, i) => {
      const typeLabel = (r.type || "").charAt(0).toUpperCase() + (r.type || "").slice(1);
      const typeBg = r.type === "boarding" ? P.pri : P.acc;
      resRows += `
              <tr>
                <td style="padding:10px 0;${i < reportData.tomorrowReservations.length - 1 ? `border-bottom:1px solid ${P.border};` : ""}">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                    <tr>
                      <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${P.text};font-weight:500;">
                        ${escapeHtml(r.dogName || r.dogId || "Guest")}
                        <span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${typeBg};color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-left:8px;vertical-align:middle;">${typeLabel}</span>
                      </td>
                      <td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${P.textMut};text-align:right;">
                        ${r.room ? escapeHtml(String(r.room)) : ""}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`;
    });

    const tomorrowObj = new Date(reportData.tomorrow + "T12:00:00");
    const tomorrowDisplay = tomorrowObj.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    body += `
    <tr><td style="padding:0 0 8px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:28px 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:${P.acc};text-transform:uppercase;letter-spacing:0.1em;padding-bottom:4px;">
                  Tomorrow's Arrivals
                </td>
              </tr>
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${P.textMut};padding-bottom:16px;">
                  ${tomorrowDisplay} &middot; ${reportData.tomorrowReservations.length} reservation${reportData.tomorrowReservations.length !== 1 ? "s" : ""}
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              ${resRows}
            </table>
          </td>
        </tr>
      </table>
    </td></tr>`;
  }

  // — Assemble full email —
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>K9 Operations Daily Report</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:${P.bg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.bg};border-collapse:collapse;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;border-collapse:collapse;">

        <!-- Header -->
        <tr><td style="padding:0 0 4px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.pri};border-radius:16px 16px 0 0;border-collapse:collapse;">
            <tr><td style="padding:36px 32px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:${P.acc};text-transform:uppercase;letter-spacing:0.15em;padding-bottom:8px;">
                    Daily Operations Report
                  </td>
                </tr>
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:800;color:#FFFFFF;line-height:1.2;padding-bottom:6px;">
                    K9 Resorts
                  </td>
                </tr>
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:rgba(255,255,255,0.65);font-weight:500;">
                    ${displayDate}
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- Accent bar -->
        <tr><td style="padding:0 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr><td style="height:4px;background:linear-gradient(90deg,${P.acc},${P.pri});font-size:0;line-height:0;">&nbsp;</td></tr>
          </table>
        </td></tr>

        <!-- Content sections on white -->
        <tr><td style="padding:0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.surface};border-collapse:collapse;">
            ${body}
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:4px 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.pri};border-radius:0 0 16px 16px;border-collapse:collapse;">
            <tr><td style="padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:rgba(255,255,255,0.45);line-height:1.6;">
                    This report was automatically generated by K9 Operations.<br>
                    Reply to this email to discuss with your team.
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:12px;">
                    <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                      <tr>
                        <td style="height:1px;width:40px;background:${P.acc};font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:rgba(255,255,255,0.3);padding-top:12px;">
                    K9 Resorts Luxury Pet Hotel &middot; Powered by K9 Operations
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ═══════════════════════════════════════════════════════════════════════════
// Weekly Email Report — OPS-014
// ═══════════════════════════════════════════════════════════════════════════

export function getDefaultWeeklyReportConfig() {
  return {
    enabled: false,
    recipients: [],
    sendDay: "1",    // Monday
    sendTime: "08:00",
    sections: {
      revenueSummary: true,
      attendanceBreakdown: true,
      bestWorstDays: true,
      checklistCompletion: true,
      newClients: true,
      funnelMetrics: true,
    },
  };
}

// ─── Weekly Data Aggregation ─────────────────────────────────────────────
export function aggregateWeeklyReport(data, weekStartDate) {
  const start = weekStartDate || addDays(todayStr(), -7);
  const days = [];
  for (let i = 0; i < 7; i++) days.push(addDays(start, i));
  const prevStart = addDays(start, -7);
  const prevDays = [];
  for (let i = 0; i < 7; i++) prevDays.push(addDays(prevStart, i));
  const endDate = days[6];

  const reservations = data.reservations || [];
  const clients = data.clients || [];
  const allOps = data.dailyOps || [];
  const rooms = data.rooms || {};

  // — Revenue: this week vs last week —
  const revenueForDays = (dayList) => {
    let total = 0;
    let txCount = 0;
    dayList.forEach((d) => {
      const dayRes = reservations.filter(
        (r) => r.checkIn <= d && r.checkOut >= d && r.status !== "cancelled"
      );
      dayRes.forEach((r) => {
        const cost = parseFloat(r._totalCost) || 0;
        if (cost > 0) { total += cost; txCount++; }
      });
    });
    return { total, txCount };
  };

  const thisWeekRevenue = revenueForDays(days);
  const lastWeekRevenue = revenueForDays(prevDays);
  const revenuePctChange = lastWeekRevenue.total > 0
    ? Math.round(((thisWeekRevenue.total - lastWeekRevenue.total) / lastWeekRevenue.total) * 100)
    : thisWeekRevenue.total > 0 ? 100 : 0;

  // — Attendance by day —
  let totalCapacity = 0;
  Object.values(rooms).forEach((roomList) => {
    if (Array.isArray(roomList)) totalCapacity += roomList.length;
  });

  const dailyAttendance = days.map((d) => {
    const boarding = reservations.filter(
      (r) => r.type === "boarding" && r.checkIn <= d && r.checkOut >= d && (r.status === "checked-in" || r.status === "upcoming")
    ).length;
    const daycare = reservations.filter(
      (r) => r.type === "daycare" && r.checkIn <= d && r.checkOut >= d && (r.status === "checked-in" || r.status === "upcoming")
    ).length;
    const dayRevenue = reservations
      .filter((r) => r.checkIn <= d && r.checkOut >= d && r.status !== "cancelled")
      .reduce((s, r) => s + (parseFloat(r._totalCost) || 0), 0);

    return { date: d, boarding, daycare, total: boarding + daycare, revenue: dayRevenue };
  });

  const totalAttendance = dailyAttendance.reduce((s, d) => s + d.total, 0);

  // — Best / Worst days —
  const sorted = [...dailyAttendance].sort((a, b) => b.revenue - a.revenue);
  const bestDay = sorted[0] || null;
  const worstDay = sorted[sorted.length - 1] || null;

  // — Checklist completion for the week —
  const checklistTypes = ["opening", "closing", "fe", "be"];
  let totalChecklistItems = 0;
  let completedChecklistItems = 0;
  days.forEach((d) => {
    checklistTypes.forEach((type) => {
      const entryId = `ops_${type}_${d}`;
      const entry = allOps.find((e) => e.id === entryId);
      const items = entry ? entry.items || {} : {};
      const keys = Object.keys(items);
      totalChecklistItems += keys.length;
      completedChecklistItems += keys.filter((k) => items[k]?.checked).length;
    });
  });
  const checklistRate = totalChecklistItems > 0
    ? Math.round((completedChecklistItems / totalChecklistItems) * 100)
    : 0;

  // — New clients this week —
  const newClients = clients.filter((c) => {
    const created = c.createdAt || c.created_at || "";
    return created >= start && created <= endDate;
  });

  // — Funnel metrics —
  const weekReservations = reservations.filter(
    (r) => r.checkIn >= start && r.checkIn <= endDate && r.status !== "cancelled"
  );
  const tours = weekReservations.filter((r) => (r.type || "").toLowerCase() === "tour").length;
  const evals = weekReservations.filter((r) => (r.type || "").toLowerCase() === "evaluation").length;
  const boardingCount = weekReservations.filter((r) => r.type === "boarding").length;
  const daycareCount = weekReservations.filter((r) => r.type === "daycare").length;

  return {
    weekStart: start,
    weekEnd: endDate,
    prevWeekStart: prevStart,
    revenue: {
      thisWeek: thisWeekRevenue.total,
      lastWeek: lastWeekRevenue.total,
      pctChange: revenuePctChange,
      txCount: thisWeekRevenue.txCount,
    },
    attendance: {
      dailyBreakdown: dailyAttendance,
      totalAttendance,
      totalCapacity,
    },
    bestDay,
    worstDay,
    checklists: {
      completed: completedChecklistItems,
      total: totalChecklistItems,
      rate: checklistRate,
    },
    newClients: newClients.map((c) => ({
      name: [c.fields?.first_name, c.fields?.last_name].filter(Boolean).join(" ") || "Unknown",
      dogs: (data.dogs || []).filter((d) => d.fields?.owner_id === c.id).length,
    })),
    funnel: { tours, evals, boarding: boardingCount, daycare: daycareCount },
  };
}

// ─── Premium Weekly HTML Email Generation ────────────────────────────────
export function generateWeeklyEmailHTML(reportData, config) {
  const cfg = config || getDefaultWeeklyReportConfig();
  const sections = cfg.sections || getDefaultWeeklyReportConfig().sections;

  const P = {
    pri: "#003462",
    acc: "#AF8D54",
    bg: "#F5F6F8",
    surface: "#FFFFFF",
    text: "#1A1D23",
    textSec: "#5A6170",
    textMut: "#959BA8",
    border: "#DFE2E8",
    suc: "#0D7A56",
    sucLt: "#ECFDF5",
    warn: "#C4720C",
    warnLt: "#FFFBEB",
    dan: "#C42B2B",
    danLt: "#FEF2F2",
  };

  const fmtCurrency = (v) =>
    "$" + Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDisplayDate = (d) => {
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const fmtFullDate = (d) => {
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };

  const trendArrow = (pct) => {
    if (pct > 0) return `<span style="color:${P.suc};font-weight:700;">&#9650; ${pct}%</span>`;
    if (pct < 0) return `<span style="color:${P.dan};font-weight:700;">&#9660; ${Math.abs(pct)}%</span>`;
    return `<span style="color:${P.textMut};font-weight:600;">&#8212; 0%</span>`;
  };

  const weekRangeLabel = `${fmtDisplayDate(reportData.weekStart)} – ${fmtDisplayDate(reportData.weekEnd)}`;

  let body = "";

  // ── Revenue Summary ──
  if (sections.revenueSummary) {
    const r = reportData.revenue;
    body += `
    <tr><td style="padding:0 0 8px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:28px 32px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:${P.acc};text-transform:uppercase;letter-spacing:0.1em;padding-bottom:16px;">
                  Revenue Summary
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td width="50%" style="padding:0 8px 0 0;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,${P.pri},${P.pri}ee);border-radius:12px;border-collapse:collapse;">
                    <tr><td style="padding:24px;text-align:center;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:600;color:rgba(255,255,255,0.7);margin-bottom:4px;">This Week</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:36px;font-weight:800;color:#FFFFFF;line-height:1;">${fmtCurrency(r.thisWeek)}</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:rgba(255,255,255,0.6);margin-top:6px;">${r.txCount} transactions</div>
                    </td></tr>
                  </table>
                </td>
                <td width="50%" style="padding:0 0 0 8px;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.bg};border-radius:12px;border-collapse:collapse;">
                    <tr><td style="padding:24px;text-align:center;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:600;color:${P.textMut};margin-bottom:4px;">Last Week</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:36px;font-weight:800;color:${P.pri};line-height:1;">${fmtCurrency(r.lastWeek)}</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;margin-top:6px;">${trendArrow(r.pctChange)} week-over-week</div>
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>`;
  }

  // ── Attendance Breakdown (day-by-day table) ──
  if (sections.attendanceBreakdown) {
    const att = reportData.attendance;
    let dayRows = "";
    att.dailyBreakdown.forEach((d, i) => {
      const dayLabel = fmtDisplayDate(d.date);
      const barPct = att.totalCapacity > 0 ? Math.min(100, Math.round((d.boarding / att.totalCapacity) * 100)) : 0;
      dayRows += `
              <tr>
                <td style="padding:10px 0;${i < att.dailyBreakdown.length - 1 ? `border-bottom:1px solid ${P.border};` : ""}">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                    <tr>
                      <td width="28%" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:600;color:${P.text};">
                        ${dayLabel}
                      </td>
                      <td width="36%" style="padding:0 12px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                          <tr><td style="background:${P.bg};border-radius:4px;height:8px;">
                            <table width="${barPct}%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                              <tr><td style="background:${P.pri};border-radius:4px;height:8px;"></td></tr>
                            </table>
                          </td></tr>
                        </table>
                      </td>
                      <td width="18%" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${P.textSec};text-align:center;">
                        <strong style="color:${P.text};">${d.total}</strong> guests
                      </td>
                      <td width="18%" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${P.textMut};text-align:right;">
                        ${fmtCurrency(d.revenue)}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`;
    });

    body += `
    <tr><td style="padding:0 0 8px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:28px 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:${P.acc};text-transform:uppercase;letter-spacing:0.1em;padding-bottom:4px;">
                  Daily Attendance Breakdown
                </td>
              </tr>
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${P.textMut};padding-bottom:16px;">
                  ${att.totalAttendance} total guest-days this week
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              ${dayRows}
            </table>
          </td>
        </tr>
      </table>
    </td></tr>`;
  }

  // ── Best / Worst Days ──
  if (sections.bestWorstDays && reportData.bestDay && reportData.worstDay) {
    const best = reportData.bestDay;
    const worst = reportData.worstDay;
    body += `
    <tr><td style="padding:0 0 8px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:28px 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:${P.acc};text-transform:uppercase;letter-spacing:0.1em;padding-bottom:16px;">
                  Highlights &amp; Lowlights
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td width="50%" style="padding:0 8px 0 0;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.sucLt};border-radius:12px;border-collapse:collapse;">
                    <tr><td style="padding:20px;text-align:center;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:${P.suc};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">
                        &#9650; Best Day
                      </div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:${P.text};margin-bottom:4px;">
                        ${fmtDisplayDate(best.date)}
                      </div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800;color:${P.suc};line-height:1;">
                        ${fmtCurrency(best.revenue)}
                      </div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${P.textMut};margin-top:4px;">
                        ${best.total} guests
                      </div>
                    </td></tr>
                  </table>
                </td>
                <td width="50%" style="padding:0 0 0 8px;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.warnLt};border-radius:12px;border-collapse:collapse;">
                    <tr><td style="padding:20px;text-align:center;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:${P.warn};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">
                        &#9660; Needs Attention
                      </div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:${P.text};margin-bottom:4px;">
                        ${fmtDisplayDate(worst.date)}
                      </div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800;color:${P.warn};line-height:1;">
                        ${fmtCurrency(worst.revenue)}
                      </div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${P.textMut};margin-top:4px;">
                        ${worst.total} guests
                      </div>
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>`;
  }

  // ── Checklist Completion ──
  if (sections.checklistCompletion) {
    const cl = reportData.checklists;
    const barColor = cl.rate === 100 ? P.suc : cl.rate >= 70 ? P.acc : P.warn;
    const statusBg = cl.rate === 100 ? P.sucLt : cl.rate >= 70 ? "#FFF9F0" : P.warnLt;
    body += `
    <tr><td style="padding:0 0 8px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:28px 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:${P.acc};text-transform:uppercase;letter-spacing:0.1em;padding-bottom:16px;">
                  Checklist Completion
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.bg};border-radius:12px;border-collapse:collapse;">
              <tr><td style="padding:24px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                  <tr>
                    <td width="60%" style="vertical-align:middle;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:48px;font-weight:800;color:${barColor};line-height:1;">${cl.rate}%</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${P.textMut};margin-top:4px;">Weekly completion rate</div>
                    </td>
                    <td width="40%" style="vertical-align:middle;text-align:right;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${P.textSec};">
                        <strong style="color:${P.text};">${cl.completed}</strong> of <strong style="color:${P.text};">${cl.total}</strong> items
                      </div>
                      <div style="margin-top:8px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                          <tr><td style="background:${P.border};border-radius:4px;height:8px;">
                            <table width="${cl.rate}%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                              <tr><td style="background:${barColor};border-radius:4px;height:8px;"></td></tr>
                            </table>
                          </td></tr>
                        </table>
                      </div>
                    </td>
                  </tr>
                </table>
              </td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>`;
  }

  // ── New Clients ──
  if (sections.newClients) {
    const nc = reportData.newClients;
    let clientRows = "";
    if (nc.length > 0) {
      nc.forEach((c, i) => {
        clientRows += `
                <tr>
                  <td style="padding:10px 0;${i < nc.length - 1 ? `border-bottom:1px solid ${P.border};` : ""}">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                      <tr>
                        <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:500;color:${P.text};">
                          ${escapeHtml(c.name)}
                        </td>
                        <td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${P.textMut};text-align:right;">
                          ${c.dogs} dog${c.dogs !== 1 ? "s" : ""}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`;
      });
    } else {
      clientRows = `
                <tr>
                  <td style="padding:16px 0;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${P.textMut};">
                    No new clients this week
                  </td>
                </tr>`;
    }

    body += `
    <tr><td style="padding:0 0 8px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:28px 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:${P.acc};text-transform:uppercase;letter-spacing:0.1em;padding-bottom:4px;">
                  New Clients
                </td>
              </tr>
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${P.textMut};padding-bottom:16px;">
                  ${nc.length} new client${nc.length !== 1 ? "s" : ""} acquired this week
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              ${clientRows}
            </table>
          </td>
        </tr>
      </table>
    </td></tr>`;
  }

  // ── Funnel Metrics ──
  if (sections.funnelMetrics) {
    const f = reportData.funnel;
    body += `
    <tr><td style="padding:0 0 8px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:28px 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:${P.acc};text-transform:uppercase;letter-spacing:0.1em;padding-bottom:16px;">
                  Funnel Metrics
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td width="25%" style="padding:0 4px 0 0;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.bg};border-radius:12px;border-collapse:collapse;">
                    <tr><td style="padding:18px 12px;text-align:center;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:800;color:${P.pri};line-height:1;">${f.tours}</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:600;color:${P.textMut};text-transform:uppercase;letter-spacing:0.05em;margin-top:4px;">Tours</div>
                    </td></tr>
                  </table>
                </td>
                <td width="25%" style="padding:0 4px;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.bg};border-radius:12px;border-collapse:collapse;">
                    <tr><td style="padding:18px 12px;text-align:center;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:800;color:${P.pri};line-height:1;">${f.evals}</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:600;color:${P.textMut};text-transform:uppercase;letter-spacing:0.05em;margin-top:4px;">Evals</div>
                    </td></tr>
                  </table>
                </td>
                <td width="25%" style="padding:0 4px;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.bg};border-radius:12px;border-collapse:collapse;">
                    <tr><td style="padding:18px 12px;text-align:center;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:800;color:${P.pri};line-height:1;">${f.boarding}</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:600;color:${P.textMut};text-transform:uppercase;letter-spacing:0.05em;margin-top:4px;">Boarding</div>
                    </td></tr>
                  </table>
                </td>
                <td width="25%" style="padding:0 0 0 4px;vertical-align:top;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.bg};border-radius:12px;border-collapse:collapse;">
                    <tr><td style="padding:18px 12px;text-align:center;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:800;color:${P.pri};line-height:1;">${f.daycare}</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:600;color:${P.textMut};text-transform:uppercase;letter-spacing:0.05em;margin-top:4px;">Daycare</div>
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>`;
  }

  // — Assemble full weekly email —
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>K9 Operations Weekly Report</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:${P.bg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.bg};border-collapse:collapse;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;border-collapse:collapse;">

        <!-- Header -->
        <tr><td style="padding:0 0 4px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.pri};border-radius:16px 16px 0 0;border-collapse:collapse;">
            <tr><td style="padding:36px 32px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;color:${P.acc};text-transform:uppercase;letter-spacing:0.15em;padding-bottom:8px;">
                    Weekly Operations Report
                  </td>
                </tr>
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:800;color:#FFFFFF;line-height:1.2;padding-bottom:6px;">
                    K9 Resorts
                  </td>
                </tr>
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:rgba(255,255,255,0.65);font-weight:500;">
                    ${weekRangeLabel}
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- Accent bar -->
        <tr><td style="padding:0 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr><td style="height:4px;background:linear-gradient(90deg,${P.acc},${P.pri});font-size:0;line-height:0;">&nbsp;</td></tr>
          </table>
        </td></tr>

        <!-- Content sections on white -->
        <tr><td style="padding:0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.surface};border-collapse:collapse;">
            ${body}
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:4px 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${P.pri};border-radius:0 0 16px 16px;border-collapse:collapse;">
            <tr><td style="padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:rgba(255,255,255,0.45);line-height:1.6;">
                    This report was automatically generated by K9 Operations.<br>
                    Reply to this email to discuss with your team.
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:12px;">
                    <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                      <tr>
                        <td style="height:1px;width:40px;background:${P.acc};font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:rgba(255,255,255,0.3);padding-top:12px;">
                    K9 Resorts Luxury Pet Hotel &middot; Powered by K9 Operations
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
