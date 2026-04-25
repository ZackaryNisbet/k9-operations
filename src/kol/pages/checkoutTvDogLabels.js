function dateOnly(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function normalizedReservationText(res = {}) {
  return [
    res.type,
    res.presence_type,
    res.resType,
    res._resTypeName,
    res.reservation_type_name,
  ].filter(Boolean).join(" ").toLowerCase();
}

export function isDaycareLikeCheckoutTvReservation(res = {}) {
  const text = normalizedReservationText(res);
  return (
    text.includes("daycare")
    || text.includes("day care")
    || text.includes("dayboarding")
    || text.includes("day boarding")
    || text.includes("evaluation")
    || text.includes("eval")
    || text.includes("tour")
  );
}

export function isBoardingLikeCheckoutTvReservation(res = {}) {
  const text = normalizedReservationText(res);
  if (isDaycareLikeCheckoutTvReservation(res)) return false;
  return (
    res.type === "boarding"
    || res.presence_type === "boarding"
    || text.includes("boarding")
    || text.includes("lodging")
    || text.includes("overnight")
    || text.includes("suite")
  );
}

export function getCheckoutTvScheduledDepartureDate(res = {}) {
  return dateOnly(
    res.checkOut
    || res.scheduledCheckOutDate
    || res.scheduled_check_out_date
    || res.end_date
    || res.endDate
  );
}

export function shouldShowDepartingTodayLabel(res = {}, today) {
  if (res.status !== "checked-in") return false;
  if (!today) return false;
  if (!isBoardingLikeCheckoutTvReservation(res)) return false;
  return getCheckoutTvScheduledDepartureDate(res) === today;
}
