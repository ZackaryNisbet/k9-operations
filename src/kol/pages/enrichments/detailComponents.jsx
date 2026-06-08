import React from "react";
import { I } from "../../../shared/icons";

export function DetailSection({ title, children }) {
  return (
    <section className="detail-section">
      <div className="section-title">{title}</div>
      {children}
    </section>
  );
}

export function PillList({ items, empty }) {
  if (!items?.length) return <p>{empty}</p>;
  return <div className="pill-list">{items.map((item) => <span key={item}>{item}</span>)}</div>;
}

export function ChecklistList({ items }) {
  if (!items?.length) return <p>No checklist steps listed.</p>;
  return (
    <div className="checklist-list">
      {items.map((item, index) => (
        <div key={`${item}_${index}`}><I.CheckCircle /> <span>{item}</span></div>
      ))}
    </div>
  );
}
