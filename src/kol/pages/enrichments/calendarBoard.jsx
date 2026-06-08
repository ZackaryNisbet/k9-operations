import React from "react";
import { buildCalendarWeeks, getEventsForDate, getThemeConfig } from "../../enrichments/enrichmentData";

export function CalendarBoard({ monthDate, events, selectedDate, selectedEventId, onSelectDate, onSelectEvent, onNew }) {
  const weeks = buildCalendarWeeks(monthDate);
  return (
    <div className="calendar-shell">
      <div className="weekday-row">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day}>{day}</div>)}
      </div>
      <div className="calendar-grid">
        {weeks.flat().map((day) => {
          const dayEvents = getEventsForDate(events, day.date, "staff");
          const selected = day.date === selectedDate;
          return (
            <button
              type="button"
              key={day.date}
              className={`calendar-day ${day.inMonth ? "" : "muted"} ${selected ? "selected" : ""}`}
              onClick={() => onSelectDate(day.date)}
            >
              <span className="day-number">{day.dayNumber}</span>
              <div className="day-events">
                {dayEvents.slice(0, 3).map((event) => {
                  const theme = getThemeConfig(event.visual_theme);
                  return (
                    <span
                      key={event.id}
                      className={String(event.id) === String(selectedEventId) ? "day-event active" : "day-event"}
                      style={{ borderColor: theme.color, background: theme.soft, color: theme.color }}
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        onSelectEvent(event);
                      }}
                    >
                      {event.title}
                    </span>
                  );
                })}
                {dayEvents.length > 3 ? <span className="more-events">+{dayEvents.length - 3} more</span> : null}
              </div>
              {onNew ? (
                <span
                  className="add-day-event"
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    onNew(day.date);
                  }}
                >
                  Add
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
