import React from "react";

export function FormSection({ title, children }) {
  return (
    <section className="grassroots-event-form-section">
      <div className="grassroots-event-form-section-title">
        {title}
      </div>
      {children}
    </section>
  );
}
