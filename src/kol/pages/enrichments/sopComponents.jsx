import React from "react";
import { gid } from "../../../shared/theme";
import { I } from "../../../shared/icons";
import { ChecklistList } from "./detailComponents";

export function ResourceLinks({ links = [] }) {
  if (!links.length) return <p>No linked resources added.</p>;
  return (
    <div className="resource-link-list">
      {links.map((link) => (
        <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
          <I.Link />
          <span>{link.label}</span>
        </a>
      ))}
    </div>
  );
}

export function SopSectionList({ sections = [] }) {
  return (
    <div className="sop-section-list">
      {sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <ChecklistList items={section.items || []} />
        </section>
      ))}
    </div>
  );
}

export function ResourceLinksEditor({ links = [], onChange }) {
  function updateLink(id, field, value) {
    onChange(links.map((link) => (link.id === id ? { ...link, [field]: value } : link)));
  }

  function removeLink(id) {
    onChange(links.filter((link) => link.id !== id));
  }

  return (
    <div className="resource-editor">
      {links.map((link, index) => (
        <div key={link.id} className="resource-editor-row">
          <input
            aria-label={`Resource ${index + 1} label`}
            value={link.label}
            onChange={(event) => updateLink(link.id, "label", event.target.value)}
            placeholder="Resource name"
          />
          <input
            aria-label={`Resource ${index + 1} URL`}
            value={link.url}
            onChange={(event) => updateLink(link.id, "url", event.target.value)}
            placeholder="https://..."
          />
          <button type="button" aria-label={`Remove ${link.label || "resource"}`} onClick={() => removeLink(link.id)}>
            <I.Trash />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary-btn wide"
        onClick={() => onChange([...links, { id: gid("resource"), label: "", url: "" }])}
      >
        <I.Plus /> Add Resource
      </button>
    </div>
  );
}

export function ProgramSopEditor({ sections = [], onChange }) {
  function updateSection(id, patch) {
    onChange(sections.map((section) => (section.id === id ? { ...section, ...patch } : section)));
  }

  function removeSection(id) {
    onChange(sections.filter((section) => section.id !== id));
  }

  function updateItem(sectionId, itemId, text) {
    onChange(sections.map((section) => {
      if (section.id !== sectionId) return section;
      return {
        ...section,
        items: section.items.map((item) => (item.id === itemId ? { ...item, text } : item)),
      };
    }));
  }

  function addItem(sectionId) {
    onChange(sections.map((section) => (
      section.id === sectionId
        ? { ...section, items: [...section.items, { id: gid("item"), text: "" }] }
        : section
    )));
  }

  function removeItem(sectionId, itemId) {
    onChange(sections.map((section) => (
      section.id === sectionId
        ? { ...section, items: section.items.filter((item) => item.id !== itemId) }
        : section
    )));
  }

  return (
    <div className="program-sop-editor">
      {sections.map((section, sectionIndex) => (
        <section key={section.id} className="program-sop-editor-section">
          <div className="program-sop-editor-head">
            <input
              aria-label={`SOP section ${sectionIndex + 1} title`}
              value={section.title}
              onChange={(event) => updateSection(section.id, { title: event.target.value })}
              placeholder="Section title"
            />
            <button type="button" aria-label={`Remove ${section.title || "section"}`} onClick={() => removeSection(section.id)}>
              <I.Trash />
            </button>
          </div>
          <div className="program-sop-editor-items">
            {section.items.map((item, itemIndex) => (
              <div key={item.id} className="program-sop-editor-item">
                <textarea
                  aria-label={`${section.title || "SOP section"} item ${itemIndex + 1}`}
                  value={item.text}
                  onChange={(event) => updateItem(section.id, item.id, event.target.value)}
                  placeholder="SOP bullet"
                  rows={2}
                />
                <button type="button" aria-label="Remove SOP bullet" onClick={() => removeItem(section.id, item.id)}>
                  <I.Trash />
                </button>
              </div>
            ))}
            <button type="button" className="secondary-btn" onClick={() => addItem(section.id)}>
              <I.Plus /> Add SOP Line
            </button>
          </div>
        </section>
      ))}
      <button
        type="button"
        className="secondary-btn wide"
        onClick={() => onChange([...sections, { id: gid("section"), title: "", items: [{ id: gid("item"), text: "" }] }])}
      >
        <I.Plus /> Add SOP Section
      </button>
    </div>
  );
}

export function ScriptList({ scripts = [] }) {
  return (
    <div className="script-list">
      {scripts.map((script) => (
        <div key={script.label} className="script-block">
          <strong>{script.label}</strong>
          <p>{script.text}</p>
        </div>
      ))}
    </div>
  );
}
