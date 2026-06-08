import React from "react";
import { I } from "../../../shared/icons";
import { CustomSelect } from "../../../shared/ui";
import { formatDirectoryStatus, initials, isVacantRole } from "../companyDirectoryModel";
import { VIEWS } from "./constants";

export function PersonAvatar({ person, size = "" }) {
  const label = initials(person?.display_name);
  return (
    <div className={`dir-avatar ${size}`}>
      {person?.photo_display_url || person?.profile_photo_url ? (
        <img src={person.photo_display_url || person.profile_photo_url} alt="" />
      ) : label}
    </div>
  );
}

export function StatusPill({ status }) {
  return <span className={`dir-pill status-${status || "active"}`}>{formatDirectoryStatus(status)}</span>;
}

export function Field({ label, children }) {
  return (
    <div>
      <div className="dir-meta-label">{label}</div>
      <div>{children || <span className="dir-muted">Needs data</span>}</div>
    </div>
  );
}

export function DirectoryHeader({ data }) {
  const inactive = data.people.filter((person) => person.directory_status === "inactive").length;
  const vacant = data.people.filter(isVacantRole).length;
  return (
    <div className="dir-hero">
      <div>
        <div className="dir-eyebrow">Enterprise Directory</div>
        <h1 className="dir-title">Company Directory</h1>
        <p className="dir-subtitle">
          Manual company people, contact details, locations, and reporting lines are maintained once here. The org chart is generated from those Supabase records.
        </p>
      </div>
      <div className="dir-stat-grid" aria-label="Directory totals">
        <div className="dir-stat"><strong>{data.people.length}</strong><span>People</span></div>
        <div className="dir-stat"><strong>{data.locations.length}</strong><span>Resorts</span></div>
        <div className="dir-stat"><strong>{data.edges.filter((edge) => edge.relationship_type === "reports_to" && edge.is_primary !== false).length}</strong><span>Report Lines</span></div>
        <div className="dir-stat"><strong>{inactive + vacant}</strong><span>Inactive / Vacant</span></div>
      </div>
    </div>
  );
}

export function DirectoryTabs({ activeView, setActiveView }) {
  return (
    <div className="dir-tabs" role="tablist" aria-label="Directory views">
      {VIEWS.map((view) => {
        const Icon = view.icon;
        return (
          <button key={view.key} className={`dir-tab ${activeView === view.key ? "active" : ""}`} onClick={() => setActiveView(view.key)} role="tab" aria-selected={activeView === view.key}>
            <Icon /> {view.label}
          </button>
        );
      })}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, className = "" }) {
  return (
    <div className={`dir-search-wrap ${className}`}>
      <I.Search />
      <input className="dir-search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function K9Select({ value, onChange, options, placeholder, searchable = false }) {
  return (
    <CustomSelect
      value={value || ""}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchable={searchable}
      searchPlaceholder={placeholder}
      small
    />
  );
}
