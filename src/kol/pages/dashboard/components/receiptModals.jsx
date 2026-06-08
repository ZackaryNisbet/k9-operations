import React, { useState, useEffect, useCallback, memo } from "react";
import { C } from "../../../../shared/theme";

/* ═══════════════════════════════════════════════════════════════════════════
   Accrual Receipt Modal
   ═══════════════════════════════════════════════════════════════════════════ */
export const AccrualReceiptModal = memo(function AccrualReceiptModal({ open, onClose, receiptData, loading, dateLabel, originRef }) {
  const [closing, setClosing] = useState(false);
  const [originRect, setOriginRect] = useState(null);

  useEffect(() => {
    if (open && originRef?.current) {
      setOriginRect(originRef.current.getBoundingClientRect());
    }
  }, [open, originRef]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => { setClosing(false); onClose(); }, 300);
  }, [onClose]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, handleClose]);

  if (!open && !closing) return null;

  const { boarding = [], daycareAgg, dayBoardAgg, boardingTotal = 0, daycareTotal = 0, grandTotal = 0 } = receiptData || {};
  const fmtMoney = (v) => `$${(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // Transform origin for expand-from-button effect
  const transformOriginStyle = originRect
    ? { transformOrigin: `${originRect.left + originRect.width / 2}px ${originRect.top + originRect.height / 2}px` }
    : {};

  return (
    <div
      className={`receipt-modal-backdrop${closing ? " closing" : ""}`}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="receipt-modal-paper" style={transformOriginStyle} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            position: "absolute", top: 14, right: 14, background: "none", border: "none",
            cursor: "pointer", color: "rgba(20,83,45,0.35)", fontSize: 18, lineHeight: 1,
            padding: 4, borderRadius: 4, transition: "color 0.15s",
          }}
          onMouseEnter={(e) => e.target.style.color = C.pri}
          onMouseLeave={(e) => e.target.style.color = "rgba(20,83,45,0.35)"}
        >
          ✕
        </button>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 8, paddingTop: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.12em", color: C.pri }}>K9 OPERATIONS</div>
          <div style={{ fontSize: 10, color: C.text, fontWeight: 600, letterSpacing: "0.06em", marginTop: 2 }}>ACCRUAL REVENUE BREAKDOWN</div>
          <div style={{ fontSize: 10, color: "rgba(20,83,45,0.5)", fontWeight: 500, marginTop: 4 }}>{dateLabel}</div>
          <div style={{ fontSize: 9, color: "rgba(20,83,45,0.4)", marginTop: 1 }}>{timeStr}</div>
        </div>

        {/* Grand Total — pinned at top so it's always visible */}
        {!loading && (
          <>
            <hr className="receipt-dashed" />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.pri, letterSpacing: "0.08em" }}>TOTAL</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.pri, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(grandTotal)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginBottom: 4 }}>
              <div style={{ width: "60%", height: 5, borderRadius: 3, overflow: "hidden", display: "flex" }}>
                {grandTotal > 0 && <div style={{ width: `${(boardingTotal / grandTotal) * 100}%`, height: "100%", background: C.pri, transition: "width 0.4s" }} />}
                {grandTotal > 0 && <div style={{ width: `${(daycareTotal / grandTotal) * 100}%`, height: "100%", background: C.acc, transition: "width 0.4s" }} />}
              </div>
              <div style={{ display: "flex", gap: 8, fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, flexShrink: 0 }}>
                <span><span style={{ color: C.pri, fontWeight: 700 }}>{grandTotal > 0 ? ((boardingTotal / grandTotal) * 100).toFixed(0) : 0}%</span> Board</span>
                <span><span style={{ color: C.acc, fontWeight: 700 }}>{grandTotal > 0 ? ((daycareTotal / grandTotal) * 100).toFixed(0) : 0}%</span> Day</span>
              </div>
            </div>
          </>
        )}

        <hr className="receipt-dashed" />

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 11, color: "rgba(20,83,45,0.5)", fontWeight: 600, letterSpacing: "0.06em" }}>LOADING RESERVATIONS...</div>
          </div>
        )}

        {/* Boarding section */}
        {!loading && boarding.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.pri, letterSpacing: "0.08em", textTransform: "uppercase" }}>■ Boarding</span>
              <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, fontStyle: "italic" }}>{boarding.length} dog{boarding.length !== 1 ? "s" : ""} boarding tonight</span>
            </div>
            {boarding.map((item, i) => (
              <div key={item.id || i} className="receipt-line-item" style={{ animationDelay: `${i * 0.03}s` }}>
                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 11, color: C.text, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1, minWidth: 0 }}>
                    {item.dogName}{item.lastInit ? ` ${item.lastInit}` : ""}
                  </span>
                  <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {`${fmtMoney(item.resTotalDisplay)} Res Cost / ${item.totalNights} Night${item.totalNights !== 1 ? "s" : ""}${item.dogsInRes > 1 ? ` / ${item.dogsInRes} Dogs` : ""}`}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                  {fmtMoney(item.accrualAmount)}
                </div>
              </div>
            ))}
            <div className="receipt-line-item" style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(20,83,45,0.08)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.pri, letterSpacing: "0.04em" }}>BOARDING SUBTOTAL</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.pri, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(boardingTotal)}</div>
            </div>
          </>
        )}

        {!loading && boarding.length > 0 && daycareAgg && daycareAgg.dogCount > 0 && <hr className="receipt-dashed" />}

        {/* Daycare section — aggregate view */}
        {!loading && daycareAgg && daycareAgg.dogCount > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.acc, letterSpacing: "0.08em", textTransform: "uppercase" }}>■ Daycare</span>
              <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, fontStyle: "italic" }}>{daycareAgg.dogCount} dog{daycareAgg.dogCount !== 1 ? "s" : ""} in daycare</span>
            </div>

            {/* Full Day line */}
            {daycareAgg.fullDayCount > 0 && (
              <div className="receipt-line-item">
                <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>Full Day</span>
                  <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500 }}>
                    {daycareAgg.fullDayCount} dog{daycareAgg.fullDayCount !== 1 ? "s" : ""} × {fmtMoney(daycareAgg.fullDayRate)}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                  {fmtMoney(daycareAgg.fullDayCount * daycareAgg.fullDayRate)}
                </div>
              </div>
            )}

            {/* Half Day line */}
            {daycareAgg.halfDayCount > 0 && (
              <div className="receipt-line-item">
                <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>Half Day</span>
                  <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500 }}>
                    {daycareAgg.halfDayCount} dog{daycareAgg.halfDayCount !== 1 ? "s" : ""} × {fmtMoney(daycareAgg.halfDayRate)}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                  {fmtMoney(daycareAgg.halfDayCount * daycareAgg.halfDayRate)}
                </div>
              </div>
            )}

            {/* Evaluation line */}
            {daycareAgg.evalCount > 0 && (
              <div className="receipt-line-item">
                <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>Evaluation</span>
                  <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500 }}>
                    {daycareAgg.evalCount} dog{daycareAgg.evalCount !== 1 ? "s" : ""} × {fmtMoney(daycareAgg.fullDayRate)}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                  {fmtMoney(daycareAgg.evalCount * daycareAgg.fullDayRate)}
                </div>
              </div>
            )}

            {/* Daycare Enrichments / Add-ons */}
            {daycareAgg.enrichments.length > 0 && (
              <>
                <div style={{ marginTop: 8, marginBottom: 4, fontSize: 9, fontWeight: 600, color: "rgba(20,83,45,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>ADD-ONS / ENRICHMENTS</div>
                {daycareAgg.enrichments.map((e, i) => (
                  <div key={e.name} className="receipt-line-item" style={{ animationDelay: `${(boarding.length + i) * 0.03}s` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: C.text, fontWeight: 500 }}>
                        {e.count}× {e.name}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                      {fmtMoney(e.totalCost)}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Daycare subtotal */}
            <div className="receipt-line-item" style={{ marginTop: 6, paddingTop: 4, borderTop: "1px solid rgba(20,83,45,0.08)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.acc, letterSpacing: "0.04em" }}>DAYCARE SUBTOTAL</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.acc, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(daycareAgg.total)}</div>
            </div>
          </>
        )}

        {/* Separator between daycare and day boarding */}
        {!loading && ((daycareAgg && daycareAgg.dogCount > 0) || boarding.length > 0) && dayBoardAgg && dayBoardAgg.count > 0 && <hr className="receipt-dashed" />}

        {/* Day Boarding section — separate from daycare */}
        {!loading && dayBoardAgg && dayBoardAgg.count > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.acc, letterSpacing: "0.08em", textTransform: "uppercase" }}>■ Day Boarding</span>
              <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, fontStyle: "italic" }}>{dayBoardAgg.count} dog{dayBoardAgg.count !== 1 ? "s" : ""} day boarding</span>
            </div>

            {/* Day Boarding base rate line */}
            <div className="receipt-line-item">
              <div style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>Day Boarding</span>
                <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500 }}>
                  {dayBoardAgg.count} dog{dayBoardAgg.count !== 1 ? "s" : ""} × {fmtMoney(dayBoardAgg.rate)}
                </span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                {fmtMoney(dayBoardAgg.count * dayBoardAgg.rate)}
              </div>
            </div>

            {/* Day Boarding Enrichments / Add-ons */}
            {dayBoardAgg.enrichments.length > 0 && (
              <>
                <div style={{ marginTop: 8, marginBottom: 4, fontSize: 9, fontWeight: 600, color: "rgba(20,83,45,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>ADD-ONS / ENRICHMENTS</div>
                {dayBoardAgg.enrichments.map((e, i) => (
                  <div key={e.name} className="receipt-line-item" style={{ animationDelay: `${(boarding.length + (daycareAgg ? daycareAgg.enrichments.length : 0) + i) * 0.03}s` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: C.text, fontWeight: 500 }}>
                        {e.count}× {e.name}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                      {fmtMoney(e.totalCost)}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Day Boarding subtotal */}
            <div className="receipt-line-item" style={{ marginTop: 6, paddingTop: 4, borderTop: "1px solid rgba(20,83,45,0.08)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.acc, letterSpacing: "0.04em" }}>DAY BOARDING SUBTOTAL</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.acc, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(dayBoardAgg.total)}</div>
            </div>
          </>
        )}

        {!loading && (
          <>
            <hr className="receipt-dashed" style={{ marginTop: 10 }} />

            {/* Footer */}
            <div style={{ textAlign: "center", paddingTop: 6, paddingBottom: 2 }}>
              <div style={{ fontSize: 9, color: "rgba(20,83,45,0.4)", fontWeight: 500, letterSpacing: "0.06em" }}>
                {boarding.length + (daycareAgg ? daycareAgg.dogCount : 0) + (dayBoardAgg ? dayBoardAgg.count : 0)} RESERVATION{(boarding.length + (daycareAgg ? daycareAgg.dogCount : 0) + (dayBoardAgg ? dayBoardAgg.count : 0)) !== 1 ? "S" : ""}
              </div>
              <div style={{ fontSize: 8, color: "rgba(20,83,45,0.25)", marginTop: 3, letterSpacing: "0.04em" }}>
                THANK YOU FOR CHOOSING K9
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   Cash Basis Receipt Modal
   ═══════════════════════════════════════════════════════════════════════════ */
export const CashBasisReceiptModal = memo(function CashBasisReceiptModal({ open, onClose, cashData, loading, dateLabel, originRef }) {
  const [closing, setClosing] = useState(false);
  const [originRect, setOriginRect] = useState(null);

  useEffect(() => {
    if (open && originRef?.current) {
      setOriginRect(originRef.current.getBoundingClientRect());
    }
  }, [open, originRef]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => { setClosing(false); onClose(); }, 300);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, handleClose]);

  if (!open && !closing) return null;

  const { payments = [], grossPayments = 0, depositCollections = 0, refunds = 0, netRevenue = 0 } = cashData || {};
  const fmtMoney = (v) => `$${Math.abs(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const invoicePayments = payments.filter(p => p.source === "invoice" && !p.isRefund);
  const depositPayments = payments.filter(p => p.source === "deposit");
  const refundPayments = payments.filter(p => p.isRefund);

  const transformOriginStyle = originRect
    ? { transformOrigin: `${originRect.left + originRect.width / 2}px ${originRect.top + originRect.height / 2}px` }
    : {};

  return (
    <div
      className={`receipt-modal-backdrop${closing ? " closing" : ""}`}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="receipt-modal-paper" style={transformOriginStyle} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={handleClose}
          style={{
            position: "absolute", top: 14, right: 14, background: "none", border: "none",
            cursor: "pointer", color: "rgba(20,83,45,0.35)", fontSize: 18, lineHeight: 1,
            padding: 4, borderRadius: 4, transition: "color 0.15s",
          }}
          onMouseEnter={(e) => e.target.style.color = C.pri}
          onMouseLeave={(e) => e.target.style.color = "rgba(20,83,45,0.35)"}
        >
          ✕
        </button>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 8, paddingTop: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.12em", color: C.pri }}>K9 OPERATIONS</div>
          <div style={{ fontSize: 10, color: C.text, fontWeight: 600, letterSpacing: "0.06em", marginTop: 2 }}>CASH BASIS REVENUE BREAKDOWN</div>
          <div style={{ fontSize: 10, color: "rgba(20,83,45,0.5)", fontWeight: 500, marginTop: 4 }}>{dateLabel}</div>
          <div style={{ fontSize: 9, color: "rgba(20,83,45,0.4)", marginTop: 1 }}>{timeStr}</div>
        </div>

        {/* Grand Total */}
        {!loading && (
          <>
            <hr className="receipt-dashed" />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.pri, letterSpacing: "0.08em" }}>NET TOTAL</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.pri, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(netRevenue)}</div>
            </div>
            {/* Progress bar: payments vs deposits vs refunds */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginBottom: 4 }}>
              <div style={{ width: "60%", height: 5, borderRadius: 3, overflow: "hidden", display: "flex" }}>
                {(grossPayments + depositCollections) > 0 && <div style={{ width: `${(grossPayments / (grossPayments + depositCollections)) * 100}%`, height: "100%", background: C.pri, transition: "width 0.4s" }} />}
                {(grossPayments + depositCollections) > 0 && <div style={{ width: `${(depositCollections / (grossPayments + depositCollections)) * 100}%`, height: "100%", background: C.acc, transition: "width 0.4s" }} />}
              </div>
              <div style={{ display: "flex", gap: 8, fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, flexShrink: 0 }}>
                <span><span style={{ color: C.pri, fontWeight: 700 }}>{fmtMoney(grossPayments)}</span> Pay</span>
                <span><span style={{ color: C.acc, fontWeight: 700 }}>{fmtMoney(depositCollections)}</span> Dep</span>
              </div>
            </div>
          </>
        )}

        <hr className="receipt-dashed" />

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 11, color: "rgba(20,83,45,0.5)", fontWeight: 600, letterSpacing: "0.06em" }}>LOADING PAYMENTS...</div>
          </div>
        )}

        {/* Payments section */}
        {!loading && invoicePayments.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.pri, letterSpacing: "0.08em", textTransform: "uppercase" }}>■ Payments</span>
              <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, fontStyle: "italic" }}>{invoicePayments.length} payment{invoicePayments.length !== 1 ? "s" : ""}</span>
            </div>
            {invoicePayments.map((p, i) => (
              <div key={`pay-${i}`} className="receipt-line-item" style={{ animationDelay: `${i * 0.03}s` }}>
                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 11, color: C.text, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1, minWidth: 0 }}>
                    {p.ownerName}
                  </span>
                  <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {p.timeStr} · {p.paymentMethod}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                  {fmtMoney(p.amount)}
                </div>
              </div>
            ))}
            <div className="receipt-line-item" style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(20,83,45,0.08)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.pri, letterSpacing: "0.04em" }}>PAYMENTS SUBTOTAL</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.pri, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(grossPayments)}</div>
            </div>
          </>
        )}

        {!loading && invoicePayments.length > 0 && depositPayments.length > 0 && <hr className="receipt-dashed" />}

        {/* Collected Deposits section */}
        {!loading && depositPayments.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.acc, letterSpacing: "0.08em", textTransform: "uppercase" }}>■ Collected Deposits</span>
              <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, fontStyle: "italic" }}>{depositPayments.length} deposit{depositPayments.length !== 1 ? "s" : ""}</span>
            </div>
            {depositPayments.map((p, i) => (
              <div key={`dep-${i}`} className="receipt-line-item" style={{ animationDelay: `${(invoicePayments.length + i) * 0.03}s` }}>
                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 11, color: C.text, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1, minWidth: 0 }}>
                    {p.ownerName}{p.animalName ? ` (${p.animalName})` : ""}
                  </span>
                  <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {p.timeStr}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                  {fmtMoney(p.amount)}
                </div>
              </div>
            ))}
            <div className="receipt-line-item" style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(20,83,45,0.08)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.acc, letterSpacing: "0.04em" }}>DEPOSITS SUBTOTAL</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.acc, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(depositCollections)}</div>
            </div>
          </>
        )}

        {!loading && refundPayments.length > 0 && <hr className="receipt-dashed" />}

        {/* Refunds section */}
        {!loading && refundPayments.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.dan, letterSpacing: "0.08em", textTransform: "uppercase" }}>■ Refunds</span>
              <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, fontStyle: "italic" }}>{refundPayments.length} refund{refundPayments.length !== 1 ? "s" : ""}</span>
            </div>
            {refundPayments.map((p, i) => (
              <div key={`ref-${i}`} className="receipt-line-item" style={{ animationDelay: `${(invoicePayments.length + depositPayments.length + i) * 0.03}s` }}>
                <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 11, color: C.dan, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1, minWidth: 0 }}>
                    {p.ownerName}
                  </span>
                  <span style={{ fontSize: 9, color: "rgba(20,83,45,0.55)", fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {p.timeStr} · {p.paymentMethod}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.dan, fontVariantNumeric: "tabular-nums", marginLeft: 12, whiteSpace: "nowrap" }}>
                  -{fmtMoney(p.amount)}
                </div>
              </div>
            ))}
            <div className="receipt-line-item" style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(20,83,45,0.08)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.dan, letterSpacing: "0.04em" }}>REFUNDS SUBTOTAL</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.dan, fontVariantNumeric: "tabular-nums" }}>-{fmtMoney(refunds)}</div>
            </div>
          </>
        )}

        {!loading && (
          <>
            <hr className="receipt-dashed" style={{ marginTop: 10 }} />

            {/* Totals breakdown */}
            <div style={{ padding: "6px 0" }}>
              <div className="receipt-line-item">
                <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(20,83,45,0.6)" }}>Gross Payments</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(grossPayments)}</div>
              </div>
              <div className="receipt-line-item">
                <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(20,83,45,0.6)" }}>Collected Deposits</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(depositCollections)}</div>
              </div>
              {refunds > 0 && (
                <div className="receipt-line-item">
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.dan }}>Refunds</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.dan, fontVariantNumeric: "tabular-nums" }}>-{fmtMoney(refunds)}</div>
                </div>
              )}
              <div className="receipt-line-item" style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(20,83,45,0.12)" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.pri, letterSpacing: "0.06em" }}>NET TOTAL</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: C.pri, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(netRevenue)}</div>
              </div>
            </div>

            <hr className="receipt-dashed" />

            {/* Footer */}
            <div style={{ textAlign: "center", paddingTop: 6, paddingBottom: 2 }}>
              <div style={{ fontSize: 9, color: "rgba(20,83,45,0.4)", fontWeight: 500, letterSpacing: "0.06em" }}>
                {payments.length} TRANSACTION{payments.length !== 1 ? "S" : ""}
              </div>
              <div style={{ fontSize: 8, color: "rgba(20,83,45,0.25)", marginTop: 3, letterSpacing: "0.04em" }}>
                THANK YOU FOR CHOOSING K9
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
