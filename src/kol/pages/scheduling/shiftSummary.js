// K9 Operations — Shift coverage + hour summary helpers
// Pure helpers extracted verbatim from SchedulingPage.jsx.

export function getShiftHourSummary(frame, breakMinutes = 30) {
  if (!frame) return null;
  const scheduledHoursPerShift = (Number(frame.end.slice(0, 2)) * 60 + Number(frame.end.slice(3, 5)) - Number(frame.start.slice(0, 2)) * 60 - Number(frame.start.slice(3, 5))) / 60;
  const workingHoursPerShift = Math.max(0, scheduledHoursPerShift - ((frame.break_minutes_per_shift ?? breakMinutes) / 60));
  return {
    scheduledHoursPerShift,
    workingHoursPerShift,
    totalScheduledHours: frame.scheduled_hours ?? Number((frame.headcount * scheduledHoursPerShift).toFixed(1)),
    totalWorkingHours: frame.working_hours_after_breaks ?? Number((frame.headcount * workingHoursPerShift).toFixed(1)),
  };
}

export function summarizeSupportRoles(entries) {
  const counts = entries.reduce((acc, entry) => {
    acc[entry.position] = (acc[entry.position] || 0) + 1;
    return acc;
  }, {});
  const labels = [];
  if (counts.supervisor) labels.push(`${counts.supervisor} supervisor${counts.supervisor === 1 ? "" : "s"}`);
  if (counts.csr) labels.push(`${counts.csr} CSR${counts.csr === 1 ? "" : "s"}`);
  if (counts.mod) labels.push(`${counts.mod} manager${counts.mod === 1 ? "" : "s"}`);
  return labels.join(", ");
}

export function countShiftCoverage(entries, startTime, endTime) {
  const startMinutes = Number(startTime?.split(":")?.[0] || 0) * 60 + Number(startTime?.split(":")?.[1] || 0);
  const endMinutes = Number(endTime?.split(":")?.[0] || 0) * 60 + Number(endTime?.split(":")?.[1] || 0);
  return entries.filter((entry) => {
    const entryStart = Number(entry.shift_start?.split(":")?.[0] || 0) * 60 + Number(entry.shift_start?.split(":")?.[1] || 0);
    const entryEnd = Number(entry.shift_end?.split(":")?.[0] || 0) * 60 + Number(entry.shift_end?.split(":")?.[1] || 0);
    return entryStart < endMinutes && entryEnd > startMinutes;
  }).length;
}
