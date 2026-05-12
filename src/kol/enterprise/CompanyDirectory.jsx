import React, { useEffect, useMemo, useRef, useState } from "react";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";
import { CustomSelect } from "../../shared/ui";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import useEnterpriseDirectory from "../../hooks/useEnterpriseDirectory";
import { createBalkanOrgChart, loadBalkanOrgChart, toBalkanNodes } from "./balkanOrgChartAdapter";
import {
  asArray,
  formatDirectoryStatus,
  formatLocationAddress,
  formatLocations,
  formatManagers,
  getDisplayLocations,
  getPrimaryManagerId,
  initials,
  isVacantRole,
} from "./companyDirectoryModel";

const VIEWS = [
  { key: "people", label: "People", icon: I.Users },
  { key: "org", label: "Org Chart", icon: I.Layers },
  { key: "resorts", label: "Resorts", icon: I.Home },
  { key: "gaps", label: "Data Gaps", icon: I.AlertTriangle },
];

const HIGHLIGHT_OPTIONS = [
  { value: "parents", label: "Leadership path" },
  { value: "children", label: "Direct reports" },
  { value: "sameLevel", label: "Same level" },
  { value: "none", label: "Off" },
];

const NAVIGATION_OPTIONS = [
  { value: "zoom", label: "Scroll to zoom" },
  { value: "scroll", label: "Scroll to move" },
  { value: "ctrl_zoom", label: "Control-scroll zoom" },
  { value: "vertical_scroll", label: "Vertical scroll" },
];

const LAYOUT_OPTIONS = [
  { value: "balanced_tree", label: "Balanced tree" },
  { value: "standard_tree", label: "Standard tree" },
  { value: "compact_tree", label: "Compact tree" },
];

const BRANCH_LAYOUT_OPTIONS = [
  { value: "standard_tree", label: "Standard tree branch" },
  { value: "compact_tree", label: "Compact branch" },
  { value: "compact_list", label: "Compact list branch" },
];

const DIRECTORY_CSS = `
.dir-shell { min-height: calc(100vh - 72px); background: #F7FAF5; color: ${C.text}; }
.dir-wrap { max-width: 1680px; margin: 0 auto; padding: 24px; }
.dir-hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 22px; align-items: end; margin-bottom: 16px; }
.dir-eyebrow { font-size: 12px; font-weight: 850; color: ${C.pri}; text-transform: uppercase; letter-spacing: 0; margin-bottom: 8px; }
.dir-title { font-size: 34px; line-height: 1.06; margin: 0; color: ${C.text}; letter-spacing: 0; }
.dir-subtitle { margin: 9px 0 0; color: ${C.textSec}; max-width: 860px; font-size: 15px; line-height: 1.5; }
.dir-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(128px, 1fr)); gap: 10px; }
.dir-stat { background: #fff; border: 1px solid ${C.border}; border-radius: 8px; padding: 12px 14px; min-width: 0; }
.dir-stat strong { display: block; font-size: 24px; color: ${C.pri}; line-height: 1; }
.dir-stat span { display: block; margin-top: 6px; color: ${C.textSec}; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0; }
.dir-tabs { display: flex; gap: 8px; padding: 6px; background: #fff; border: 1px solid ${C.border}; border-radius: 8px; width: fit-content; margin-bottom: 16px; }
.dir-tab { border: none; border-radius: 6px; background: transparent; color: ${C.textSec}; font: inherit; font-size: 13px; font-weight: 850; padding: 10px 13px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 38px; }
.dir-tab svg { width: 17px; height: 17px; flex: 0 0 auto; }
.dir-tab.active { background: ${C.pri}; color: #fff; }
.dir-panel { background: #fff; border: 1px solid ${C.border}; border-radius: 8px; overflow: hidden; }
.dir-toolbar { display: grid; grid-template-columns: minmax(260px, 1.35fr) repeat(3, minmax(150px, .9fr)) auto; gap: 10px; padding: 14px; border-bottom: 1px solid ${C.border}; background: #fff; align-items: center; }
.dir-toolbar.resorts { grid-template-columns: minmax(260px, 1.35fr) repeat(3, minmax(150px, .9fr)); }
.dir-search-wrap { position: relative; min-width: 0; }
.dir-search-wrap svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: ${C.textSec}; width: 16px; height: 16px; }
.dir-search, .dir-select, .dir-input { height: 40px; border: 1px solid ${C.border}; border-radius: 8px; padding: 0 12px; font: inherit; font-size: 13px; color: ${C.text}; background: #fff; min-width: 0; width: 100%; }
.dir-search { padding-left: 38px; }
.dir-input.textarea { min-height: 78px; padding-top: 10px; resize: vertical; }
.dir-action { height: 40px; border: 1px solid ${C.border}; border-radius: 8px; background: #fff; color: ${C.text}; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font: inherit; font-size: 13px; font-weight: 850; padding: 0 12px; white-space: nowrap; }
.dir-action:hover { border-color: ${C.pri}; color: ${C.pri}; background: ${C.priLt}; }
.dir-action.primary { background: ${C.pri}; border-color: ${C.pri}; color: #fff; }
.dir-action.primary:hover { background: #084B18; color: #fff; }
.dir-action.danger { color: ${C.dan}; }
.dir-action:disabled { opacity: .5; cursor: not-allowed; }
.dir-add-action { min-width: 130px; box-shadow: 0 1px 3px rgba(20,83,45,.24); }
.dir-table-wrap { overflow-x: auto; }
.dir-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 940px; }
.dir-table.resorts { min-width: 1100px; }
.dir-table th { text-align: left; color: ${C.textSec}; font-size: 11px; text-transform: uppercase; letter-spacing: 0; padding: 12px 14px; background: #F8FAF7; border-bottom: 1px solid ${C.border}; white-space: nowrap; }
.dir-table td { padding: 13px 14px; border-bottom: 1px solid ${C.border}; vertical-align: middle; }
.dir-row { cursor: pointer; transition: background .12s; }
.dir-row:hover { background: ${C.priLt}; }
.dir-cell-main { font-weight: 850; color: ${C.text}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 230px; }
.dir-person { display: flex; align-items: center; gap: 11px; min-width: 0; }
.dir-avatar { width: 38px; height: 38px; border-radius: 8px; background: ${C.pri}; color: #fff; display: grid; place-items: center; font-weight: 900; font-size: 13px; flex: 0 0 auto; border: 1px solid rgba(11,93,30,.12); overflow: hidden; }
.dir-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dir-avatar.large { width: 68px; height: 68px; font-size: 20px; border-radius: 10px; }
.dir-name { font-weight: 850; color: ${C.text}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dir-muted { color: ${C.textSec}; font-size: 12px; line-height: 1.45; }
.dir-strong-muted { color: ${C.text}; font-size: 12px; font-weight: 750; }
.dir-pill { display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border-radius: 999px; font-size: 11px; line-height: 15px; font-weight: 850; background: ${C.priLt}; color: ${C.pri}; white-space: nowrap; border: 1px solid rgba(11,93,30,.08); }
.dir-pill.warn { background: ${C.warnLt}; color: ${C.warn}; border-color: rgba(204,124,0,.16); }
.dir-pill.neutral { background: #F3F4F6; color: #4B5563; border-color: #E5E7EB; }
.dir-pill.status-inactive { background: #F3F4F6; color: #6B7280; border-color: #D1D5DB; }
.dir-pill.status-needs_data { background: ${C.warnLt}; color: ${C.warn}; }
.dir-switch-chip { min-height: 32px; display: inline-flex; align-items: center; gap: 8px; padding: 4px 10px; border-radius: 999px; border: 1px solid ${C.border}; background: #fff; color: ${C.textSec}; font-size: 11px; font-weight: 850; cursor: pointer; white-space: nowrap; }
.dir-switch-chip input { position: absolute; opacity: 0; pointer-events: none; }
.dir-switch-chip.active { border-color: ${C.pri}; background: ${C.pri}; color: #fff; }
.dir-switch-track { width: 34px; height: 20px; border-radius: 999px; background: #CBD5E1; position: relative; transition: background .16s ease; flex: 0 0 auto; }
.dir-switch-track::after { content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 999px; background: #fff; box-shadow: 0 1px 3px rgba(15,23,42,.25); transition: transform .16s ease; }
.dir-switch-chip.active .dir-switch-track { background: ${C.acc}; }
.dir-switch-chip.active .dir-switch-track::after { transform: translateX(14px); }
.dir-empty { padding: 42px; text-align: center; color: ${C.textSec}; }
.dir-meta-label { font-size: 11px; font-weight: 850; color: ${C.textSec}; text-transform: uppercase; letter-spacing: 0; margin-bottom: 4px; }
.dir-gap-list { display: grid; gap: 10px; padding: 14px; }
.dir-gap { border: 1px solid ${C.border}; border-left: 4px solid ${C.warn}; border-radius: 8px; padding: 14px; background: #fff; }
.dir-gap h3 { margin: 0 0 5px; font-size: 15px; color: ${C.text}; }
.dir-chart-head { padding: 14px; border-bottom: 1px solid ${C.border}; display: grid; grid-template-columns: minmax(260px, 1fr) auto; gap: 12px; background: #fff; align-items: center; overflow: visible; }
.dir-chart-title h2 { margin: 0; font-size: 20px; line-height: 1.15; color: ${C.text}; }
.dir-chart-title p { margin: 5px 0 0; color: ${C.textSec}; font-size: 13px; line-height: 1.35; max-width: 820px; }
.dir-chart-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.dir-chart-search { width: min(340px, 36vw); }
.dir-settings { position: relative; }
.dir-settings-panel { position: absolute; right: 0; top: calc(100% + 8px); width: min(720px, 92vw); z-index: 70; border: 1px solid ${C.border}; border-radius: 8px; background: rgba(255,255,255,.98); box-shadow: 0 24px 60px rgba(15,23,42,.16); padding: 14px; display: grid; gap: 12px; }
.dir-settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.dir-settings-row { display: grid; gap: 6px; min-width: 0; }
.dir-settings-row label { font-size: 11px; font-weight: 850; color: ${C.textSec}; text-transform: uppercase; letter-spacing: 0; }
.dir-settings-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.dir-chart-shell { padding: 12px; background: #fff; }
.dir-chart-card { height: clamp(720px, calc(100vh - 170px), 1040px); border: 1px solid ${C.border}; border-radius: 8px; background: #FCFEFB; overflow: hidden; }
.dir-chart-card svg { display: block; }
.dir-chart-card .highlighted rect.boc-hoverable { stroke: ${C.pri}; stroke-width: 2.5; }
.dir-chart-card .not-highlighted { opacity: .34; }
.dir-tree-list { display: grid; gap: 8px; padding: 14px; }
.dir-tree-row { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid ${C.border}; }
.dir-tree-contact { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 5px; font-size: 11px; font-weight: 750; color: ${C.textSec}; }
.dir-tree-contact span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dir-drawer-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.30); z-index: 2000; }
.dir-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(520px, 100vw); background: #fff; z-index: 2001; box-shadow: -24px 0 70px rgba(15,23,42,.22); display: flex; flex-direction: column; }
.dir-drawer-head { padding: 22px; border-bottom: 1px solid ${C.border}; display: flex; gap: 14px; align-items: center; }
.dir-drawer-body { padding: 18px 22px 26px; overflow: auto; display: grid; gap: 16px; }
.dir-close { margin-left: auto; width: 34px; height: 34px; border-radius: 8px; border: 1px solid ${C.border}; background: #fff; cursor: pointer; color: ${C.textSec}; display: grid; place-items: center; flex: 0 0 auto; }
.dir-detail-block { border: 1px solid ${C.border}; border-radius: 8px; padding: 14px; }
.dir-detail-block h4 { margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0; color: ${C.textSec}; }
.dir-form { display: grid; gap: 14px; }
.dir-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.dir-field { display: grid; gap: 6px; min-width: 0; }
.dir-field label { font-size: 11px; font-weight: 850; color: ${C.textSec}; text-transform: uppercase; letter-spacing: 0; }
.dir-photo-edit { display: grid; grid-template-columns: 78px minmax(0, 1fr); gap: 14px; align-items: center; padding: 12px; border: 1px solid ${C.border}; border-radius: 8px; background: #F8FAF7; }
.dir-file { width: 100%; font: inherit; font-size: 12px; color: ${C.textSec}; }
.dir-inline-error { border: 1px solid rgba(185, 28, 28, .22); background: #FEF2F2; color: #991B1B; border-radius: 8px; padding: 10px 12px; font-size: 13px; line-height: 1.35; }
.dir-inline-note { border: 1px solid ${C.border}; background: #F8FAF7; color: ${C.textSec}; border-radius: 8px; padding: 10px 12px; font-size: 13px; line-height: 1.35; }
.dir-mobile-only { display: none; }
@media (max-width: 1080px) {
  .dir-wrap { padding: 18px; }
  .dir-hero { grid-template-columns: 1fr; }
  .dir-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dir-toolbar { grid-template-columns: 1fr 1fr; }
  .dir-toolbar.resorts { grid-template-columns: 1fr 1fr; }
  .dir-toolbar .dir-action.primary { grid-column: span 2; }
  .dir-chart-head { grid-template-columns: 1fr; }
  .dir-chart-actions { justify-content: flex-start; }
  .dir-chart-search { width: min(100%, 420px); }
  .dir-settings-panel { left: 0; right: auto; }
}
@media (max-width: 760px) {
  .dir-title { font-size: 28px; }
  .dir-tabs { width: 100%; overflow-x: auto; }
  .dir-tab { flex: 1 0 auto; }
  .dir-toolbar { grid-template-columns: 1fr; }
  .dir-toolbar.resorts { grid-template-columns: 1fr; }
  .dir-toolbar .dir-action.primary { grid-column: auto; }
  .dir-form-grid { grid-template-columns: 1fr; }
  .dir-table { min-width: 860px; }
  .dir-settings-grid { grid-template-columns: 1fr; }
  .dir-settings-panel { position: fixed; left: 12px; right: 12px; top: 86px; width: auto; max-height: calc(100vh - 110px); overflow: auto; }
  .dir-chart-card { display: none; }
  .dir-mobile-only { display: block; }
  .dir-tree-row { grid-template-columns: 38px minmax(0, 1fr); }
  .dir-tree-row .dir-action { grid-column: 2; width: fit-content; }
}
`;

function useDirectoryStyles() {
  useEffect(() => {
    if (document.getElementById("k9-enterprise-directory-css")) return;
    const style = document.createElement("style");
    style.id = "k9-enterprise-directory-css";
    style.textContent = DIRECTORY_CSS;
    document.head.appendChild(style);
  }, []);
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, [query]);
  return matches;
}

function PersonAvatar({ person, size = "" }) {
  const label = initials(person?.display_name);
  return (
    <div className={`dir-avatar ${size}`}>
      {person?.photo_display_url || person?.profile_photo_url ? (
        <img src={person.photo_display_url || person.profile_photo_url} alt="" />
      ) : label}
    </div>
  );
}

function StatusPill({ status }) {
  return <span className={`dir-pill status-${status || "active"}`}>{formatDirectoryStatus(status)}</span>;
}

function Field({ label, children }) {
  return (
    <div>
      <div className="dir-meta-label">{label}</div>
      <div>{children || <span className="dir-muted">Needs data</span>}</div>
    </div>
  );
}

function DirectoryHeader({ data }) {
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

function DirectoryTabs({ activeView, setActiveView }) {
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

function SearchInput({ value, onChange, placeholder, className = "" }) {
  return (
    <div className={`dir-search-wrap ${className}`}>
      <I.Search />
      <input className="dir-search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function makeOptions(values) {
  return values
    .filter(Boolean)
    .map((value) => ({ value, label: value }));
}

function K9Select({ value, onChange, options, placeholder, searchable = false }) {
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

function getLocationAssignment(data, locationId, responsibilityType) {
  return data.people.find((person) => (
    asArray(person.locations).some((location) => (
      location.id === locationId && location.responsibility_type === responsibilityType
    ))
  )) || null;
}

function formatResortState(location) {
  return location.state_code || location.region_label || "Needs data";
}

function PeopleView({ data, onSelectPerson, onCreatePerson }) {
  const [filters, setFilters] = useState({ query: "", title: "", department: "", location: "" });
  const people = data.searchPeople(filters);
  const titles = [...new Set(data.people.map((person) => person.title).filter(Boolean))].sort();
  const departments = [...new Set(data.people.map((person) => person.department).filter(Boolean))].sort();
  const locations = [...new Set(data.locations.map((location) => location.display_name).filter(Boolean))].sort();
  const update = (key) => (value) => setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className="dir-panel">
      <div className="dir-toolbar">
        <SearchInput value={filters.query} onChange={(value) => setFilters((current) => ({ ...current, query: value }))} placeholder="Search name, title, email, phone, resort..." />
        <K9Select value={filters.title} onChange={update("title")} options={makeOptions(titles)} placeholder="All titles" searchable />
        <K9Select value={filters.department} onChange={update("department")} options={makeOptions(departments)} placeholder="All groups" searchable />
        <K9Select value={filters.location} onChange={update("location")} options={makeOptions(locations)} placeholder="All locations" searchable />
        <button className="dir-action primary dir-add-action" type="button" onClick={onCreatePerson}><I.Plus /> Add Person</button>
      </div>
      {people.length ? (
        <div className="dir-table-wrap">
          <table className="dir-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Title</th>
                <th>Phone Number</th>
                <th>Email</th>
                <th>Group</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id} className="dir-row" onClick={() => onSelectPerson(person.id)}>
                  <td><div className="dir-cell-main">{person.display_name}</div></td>
                  <td>{person.title || <span className="dir-pill warn">Needs title</span>}</td>
                  <td><span className="dir-muted">{person.work_phone || "No phone"}</span></td>
                  <td><span className="dir-muted">{person.email || "No email"}</span></td>
                  <td><span className="dir-muted">{person.department || "Operations"}</span></td>
                  <td><span className="dir-muted">{formatLocations(person)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="dir-empty">No directory people match those filters.</div>
      )}
    </div>
  );
}

function PersonForm({ data, person, onCancel, onSaved }) {
  const initialLocation = getDisplayLocations(person)[0]?.id || "";
  const presentationSupported = Boolean(person && Object.prototype.hasOwnProperty.call(person, "org_chart_display_role"))
    || data.people.some((row) => Object.prototype.hasOwnProperty.call(row, "org_chart_display_role"));
  const [values, setValues] = useState({
    display_name: person?.display_name || "",
    title: person?.title || "",
    department: person?.department || "",
    location_id: initialLocation,
    email: person?.email || "",
    work_phone: person?.work_phone || "",
    manager_id: getPrimaryManagerId(person),
    directory_status: person?.directory_status || "active",
    person_type: person?.person_type || "person",
    org_chart_display_role: presentationSupported ? (person?.org_chart_display_role || "standard") : undefined,
    org_chart_partner_person_id: presentationSupported ? (person?.org_chart_partner_person_id || "") : undefined,
    org_chart_branch_layout: presentationSupported ? (person?.org_chart_branch_layout || "standard_tree") : undefined,
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(person?.photo_display_url || person?.profile_photo_url || "");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!photoFile) return undefined;
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const update = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const updateValue = (key) => (value) => setValues((current) => ({ ...current, [key]: value }));
  const managerOptions = data.people
    .filter((candidate) => candidate.id !== person?.id)
    .sort((a, b) => String(a.display_name || "").localeCompare(String(b.display_name || "")));
  const locationOptions = data.locations.map((location) => ({ value: location.id, label: location.display_name }));
  const managerSelectOptions = managerOptions.map((candidate) => ({ value: candidate.id, label: candidate.display_name }));

  const submit = async (event) => {
    event.preventDefault();
    setFormError("");
    const validation = data.getManagerValidation({ childId: person?.id, managerId: values.manager_id });
    if (!validation.valid) {
      setFormError(validation.reason);
      return;
    }
    try {
      const saved = await data.savePerson({ personId: person?.id || null, values, photoFile });
      onSaved(saved.id);
    } catch (error) {
      setFormError(error.message || "Directory save failed.");
    }
  };

  return (
    <form className="dir-form" onSubmit={submit}>
      <div className="dir-photo-edit">
        <div className="dir-avatar large">
          {photoPreview ? <img src={photoPreview} alt="" /> : initials(values.display_name)}
        </div>
        <div>
          <div className="dir-meta-label">Profile Photo</div>
          <input className="dir-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhotoFile(event.target.files?.[0] || null)} />
          <div className="dir-muted">JPG, PNG, or WebP. Private Supabase storage path, signed for display.</div>
        </div>
      </div>

      <div className="dir-form-grid">
        <div className="dir-field">
          <label>Name</label>
          <input className="dir-input" value={values.display_name} onChange={update("display_name")} required />
        </div>
        <div className="dir-field">
          <label>Title / Role</label>
          <input className="dir-input" value={values.title} onChange={update("title")} />
        </div>
        <div className="dir-field">
          <label>Department / Group</label>
          <input className="dir-input" value={values.department} onChange={update("department")} placeholder="Operations, Training, Finance..." />
        </div>
        <div className="dir-field">
          <label>Location / Resort</label>
          <K9Select value={values.location_id} onChange={updateValue("location_id")} options={locationOptions} placeholder="Corporate / no resort" searchable />
        </div>
        <div className="dir-field">
          <label>Email</label>
          <input className="dir-input" type="email" value={values.email} onChange={update("email")} />
        </div>
        <div className="dir-field">
          <label>Phone</label>
          <input className="dir-input" value={values.work_phone} onChange={update("work_phone")} />
        </div>
        <div className="dir-field">
          <label>Reports To</label>
          <K9Select value={values.manager_id} onChange={updateValue("manager_id")} options={managerSelectOptions} placeholder="No manager / top level" searchable />
        </div>
        <div className="dir-field">
          <label>Status</label>
          <K9Select value={values.directory_status} onChange={updateValue("directory_status")} options={[
            { value: "active", label: "Active" },
            { value: "needs_data", label: "Needs data" },
            { value: "inactive", label: "Inactive" },
          ]} placeholder="Status" />
        </div>
        <div className="dir-field">
          <label>Record Type</label>
          <K9Select value={values.person_type} onChange={updateValue("person_type")} options={[
            { value: "person", label: "Person" },
            { value: "vacant_role", label: "Vacant role" },
          ]} placeholder="Record type" />
        </div>
        {presentationSupported && (
          <>
            <div className="dir-field">
              <label>Org Placement</label>
              <K9Select value={values.org_chart_display_role} onChange={updateValue("org_chart_display_role")} options={[
                { value: "standard", label: "Standard person" },
                { value: "side_by_side_leader", label: "Side-by-side leader" },
                { value: "assistant", label: "Assistant placement" },
              ]} placeholder="Standard person" />
            </div>
            <div className="dir-field">
              <label>Side-by-side With</label>
              <K9Select value={values.org_chart_partner_person_id} onChange={updateValue("org_chart_partner_person_id")} options={managerSelectOptions} placeholder="No partner" searchable />
            </div>
            <div className="dir-field">
              <label>Branch Layout</label>
              <K9Select value={values.org_chart_branch_layout} onChange={updateValue("org_chart_branch_layout")} options={BRANCH_LAYOUT_OPTIONS} placeholder="Standard tree branch" />
            </div>
          </>
        )}
      </div>

      {formError && <div className="dir-inline-error">{formError}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button className="dir-action" type="button" onClick={onCancel}>Cancel</button>
        <button className="dir-action primary" type="submit" disabled={data.saving}>{data.saving ? "Saving..." : "Save directory record"}</button>
      </div>
    </form>
  );
}

function PersonDrawer({ data, person, mode, onClose, onEdit, onSaved }) {
  if (!mode) return null;
  const isEditing = mode === "edit" || mode === "create";
  const title = mode === "create" ? "Add person" : isEditing ? "Edit directory record" : person?.display_name;
  const directReports = person ? (data.directReportsByManager.get(person.id) || []) : [];

  return (
    <>
      <div className="dir-drawer-backdrop" onClick={onClose} />
      <aside className="dir-drawer" aria-label={title}>
        <div className="dir-drawer-head">
          <PersonAvatar person={person || { display_name: "New Person" }} size="large" />
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 22, color: C.text }}>{title}</h2>
            <div className="dir-muted">{mode === "create" ? "Manual directory source of truth" : person?.title || "Needs title"}</div>
          </div>
          <button className="dir-close" onClick={onClose} aria-label="Close details"><I.X /></button>
        </div>
        <div className="dir-drawer-body">
          {isEditing ? (
            <PersonForm data={data} person={person} onCancel={onClose} onSaved={onSaved} />
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <StatusPill status={person.directory_status} />
                <button className="dir-action primary" type="button" onClick={() => onEdit(person.id)}><I.Edit /> Edit</button>
              </div>
              <div className="dir-detail-block">
                <h4>Directory Fields</h4>
                <div style={{ display: "grid", gap: 12 }}>
                  <Field label="Email">{person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : null}</Field>
                  <Field label="Work Phone">{person.work_phone ? <a href={`tel:${person.work_phone}`}>{person.work_phone}</a> : null}</Field>
                  <Field label="Department / Group">{person.department || "Operations"}</Field>
                  <Field label="Resort / Location">{formatLocations(person)}</Field>
                  <Field label="Reports To">{formatManagers(person)}</Field>
                </div>
              </div>
              <div className="dir-detail-block">
                <h4>Direct Reports</h4>
                {directReports.length ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {directReports.map((report) => (
                      <div key={report.id} className="dir-person">
                        <PersonAvatar person={report} />
                        <div>
                          <div className="dir-name">{report.display_name}</div>
                          <div className="dir-muted">{report.title || "Needs title"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="dir-muted">No direct reports listed.</div>
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function buildResortRows(data) {
  return data.locations.map((location) => {
    const gm = getLocationAssignment(data, location.id, "general_manager");
    const regional = getLocationAssignment(data, location.id, "regional_manager");
    return {
      location,
      state: formatResortState(location),
      address: formatLocationAddress(location) || "Needs address data",
      generalManager: gm,
      regionalManager: regional,
    };
  });
}

function ResortsView({ data, onSelectLocation }) {
  const [filters, setFilters] = useState({ query: "", state: "", generalManager: "", regionalManager: "" });
  const rows = useMemo(() => {
    const query = String(filters.query || "").trim().toLowerCase();
    return buildResortRows(data).filter((row) => {
      const haystack = [
        row.state,
        row.location.display_name,
        row.address,
        row.generalManager?.display_name,
        row.regionalManager?.display_name,
        row.location.location_key,
      ].join(" ").toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (filters.state && row.state !== filters.state) return false;
      if (filters.generalManager && row.generalManager?.id !== filters.generalManager) return false;
      if (filters.regionalManager && row.regionalManager?.id !== filters.regionalManager) return false;
      return true;
    });
  }, [data, filters]);
  const states = [...new Set(buildResortRows(data).map((row) => row.state).filter(Boolean))].sort();
  const personOptions = data.people
    .filter((person) => person.directory_status !== "inactive")
    .sort((a, b) => String(a.display_name || "").localeCompare(String(b.display_name || "")))
    .map((person) => ({ value: person.id, label: person.display_name }));
  const update = (key) => (value) => setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className="dir-panel">
      <div className="dir-toolbar resorts">
        <SearchInput value={filters.query} onChange={update("query")} placeholder="Search resorts, managers, address..." />
        <K9Select value={filters.state} onChange={update("state")} options={makeOptions(states)} placeholder="All states" searchable />
        <K9Select value={filters.generalManager} onChange={update("generalManager")} options={personOptions} placeholder="All general managers" searchable />
        <K9Select value={filters.regionalManager} onChange={update("regionalManager")} options={personOptions} placeholder="All regional managers" searchable />
      </div>
      {rows.length ? (
        <div className="dir-table-wrap">
          <table className="dir-table resorts">
            <thead>
              <tr>
                <th>State</th>
                <th>Resort Name</th>
                <th>Address</th>
                <th>General Manager</th>
                <th>Regional Manager</th>
                <th>Location ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.location.id} className="dir-row" onClick={() => onSelectLocation(row.location.id)}>
                  <td><span className={row.state === "Needs data" ? "dir-pill warn" : "dir-muted"}>{row.state}</span></td>
                  <td><div className="dir-cell-main">{row.location.display_name}</div></td>
                  <td><span className="dir-muted">{row.address}</span></td>
                  <td><span className={row.generalManager ? "dir-muted" : "dir-pill warn"}>{row.generalManager?.display_name || "Needs data"}</span></td>
                  <td><span className={row.regionalManager ? "dir-muted" : "dir-pill warn"}>{row.regionalManager?.display_name || "Needs data"}</span></td>
                  <td><span className="dir-muted">{row.location.location_key}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="dir-empty">No resorts match those filters.</div>
      )}
    </div>
  );
}

function ResortForm({ data, location, onCancel, onSaved }) {
  const generalManager = getLocationAssignment(data, location.id, "general_manager");
  const regionalManager = getLocationAssignment(data, location.id, "regional_manager");
  const [values, setValues] = useState({
    state_code: location.state_code || location.region_label || "",
    display_name: location.display_name || "",
    address_line1: location.address_line1 || "",
    address_line2: location.address_line2 || "",
    city: location.city || "",
    postal_code: location.postal_code || "",
    general_manager_id: generalManager?.id || "",
    regional_manager_id: regionalManager?.id || "",
    location_key: location.location_key || "",
  });
  const [formError, setFormError] = useState("");
  const personOptions = data.people
    .filter((person) => person.directory_status !== "inactive")
    .sort((a, b) => String(a.display_name || "").localeCompare(String(b.display_name || "")))
    .map((person) => ({ value: person.id, label: person.display_name }));
  const update = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const updateValue = (key) => (value) => setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setFormError("");
    try {
      await data.saveLocation({ locationId: location.id, values });
      onSaved(location.id);
    } catch (error) {
      setFormError(error.message || "Resort save failed.");
    }
  };

  return (
    <form className="dir-form" onSubmit={submit}>
      <div className="dir-form-grid">
        <div className="dir-field">
          <label>State</label>
          <input className="dir-input" value={values.state_code} onChange={update("state_code")} placeholder="NJ" />
        </div>
        <div className="dir-field">
          <label>Resort Name</label>
          <input className="dir-input" value={values.display_name} onChange={update("display_name")} required />
        </div>
        <div className="dir-field">
          <label>Address</label>
          <input className="dir-input" value={values.address_line1} onChange={update("address_line1")} placeholder="Street or workbook address" />
        </div>
        <div className="dir-field">
          <label>Address 2</label>
          <input className="dir-input" value={values.address_line2} onChange={update("address_line2")} />
        </div>
        <div className="dir-field">
          <label>City</label>
          <input className="dir-input" value={values.city} onChange={update("city")} />
        </div>
        <div className="dir-field">
          <label>Postal Code</label>
          <input className="dir-input" value={values.postal_code} onChange={update("postal_code")} />
        </div>
        <div className="dir-field">
          <label>General Manager</label>
          <K9Select value={values.general_manager_id} onChange={updateValue("general_manager_id")} options={personOptions} placeholder="Needs data" searchable />
        </div>
        <div className="dir-field">
          <label>Regional Manager</label>
          <K9Select value={values.regional_manager_id} onChange={updateValue("regional_manager_id")} options={personOptions} placeholder="Needs data" searchable />
        </div>
        <div className="dir-field">
          <label>Location ID</label>
          <input className="dir-input" value={values.location_key} onChange={update("location_key")} required />
        </div>
      </div>
      {formError && <div className="dir-inline-error">{formError}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button className="dir-action" type="button" onClick={onCancel}>Cancel</button>
        <button className="dir-action primary" type="submit" disabled={data.saving}>{data.saving ? "Saving..." : "Save resort"}</button>
      </div>
    </form>
  );
}

function LocationDrawer({ data, location, mode, onClose, onSaved }) {
  if (!mode || !location) return null;
  return (
    <>
      <div className="dir-drawer-backdrop" onClick={onClose} />
      <aside className="dir-drawer" aria-label={`Edit ${location.display_name}`}>
        <div className="dir-drawer-head">
          <div className="dir-avatar large"><I.Home /></div>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 22, color: C.text }}>Edit Resort</h2>
            <div className="dir-muted">{location.display_name || "Needs name"}</div>
          </div>
          <button className="dir-close" onClick={onClose} aria-label="Close resort editor"><I.X /></button>
        </div>
        <div className="dir-drawer-body">
          <ResortForm data={data} location={location} onCancel={onClose} onSaved={onSaved} />
        </div>
      </aside>
    </>
  );
}

function DataGapsView({ data }) {
  const locationsById = data.locationsById;
  const peopleById = data.peopleById;
  return (
    <div className="dir-panel">
      {data.gaps.length ? (
        <div className="dir-gap-list">
          {data.gaps.map((gap) => {
            const locationName = gap.location_id ? locationsById.get(gap.location_id)?.display_name : null;
            const personName = gap.person_id ? peopleById.get(gap.person_id)?.display_name : null;
            return (
              <section className="dir-gap" key={gap.id || gap.gap_key}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                  <div>
                    <h3>{locationName || personName || gap.entity_key}</h3>
                    <div className="dir-muted">{gap.detail}</div>
                  </div>
                  <span className="dir-pill warn">{gap.status_label || "Needs data"}</span>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="dir-empty">No open directory data gaps.</div>
      )}
    </div>
  );
}

function buildTreeRows(people, directReportsByManager) {
  const peopleWithManager = new Set();
  directReportsByManager.forEach((reports) => reports.forEach((person) => peopleWithManager.add(person.id)));
  const roots = people.filter((person) => !peopleWithManager.has(person.id) && person.directory_status !== "inactive");
  const rows = [];
  function walk(person, depth) {
    rows.push({ person, depth });
    (directReportsByManager.get(person.id) || []).forEach((report) => walk(report, depth + 1));
  }
  roots.forEach((person) => walk(person, 0));
  return rows;
}

function MobileTreeView({ data, onSelectPerson, onEditPerson, showContactFields }) {
  const rows = useMemo(() => buildTreeRows(data.people, data.directReportsByManager), [data.directReportsByManager, data.people]);
  return (
    <div className="dir-tree-list">
      {rows.map(({ person, depth }) => (
        <div className="dir-tree-row" key={person.id} style={{ paddingLeft: Math.min(depth * 18, 72) }}>
          <PersonAvatar person={person} />
          <button type="button" onClick={() => onSelectPerson(person.id)} style={{ border: 0, background: "transparent", padding: 0, textAlign: "left", minWidth: 0 }}>
            <div className="dir-name">{person.display_name}</div>
            <div className="dir-muted">{person.title || "Needs title"} · {formatLocations(person)}</div>
            {showContactFields && (
              <div className="dir-tree-contact">
                <span>{person.work_phone || "No phone"}</span>
                <span>{person.email || "No email"}</span>
              </div>
            )}
          </button>
          <button className="dir-action" type="button" onClick={() => onEditPerson(person.id)}><I.Edit /> Change manager</button>
        </div>
      ))}
    </div>
  );
}

function OrgChartView({ data, onSelectPerson, onEditPerson }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  const isMobile = useMediaQuery("(max-width: 760px)");
  const [status, setStatus] = useState("Preparing org chart");
  const [chartReady, setChartReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chartFilters, setChartFilters] = useState({ group: "", location: "" });
  const [highlightMode, setHighlightMode] = useState("parents");
  const [navigationMode, setNavigationMode] = useState("zoom");
  const [layoutMode, setLayoutMode] = useState("balanced_tree");
  const [miniMap, setMiniMap] = useState(false);
  const [showContactFields, setShowContactFields] = useState(false);
  const [branchPersonId, setBranchPersonId] = useState("");
  const [branchLayouts, setBranchLayouts] = useState({});

  const groups = useMemo(() => [...new Set(data.people.map((person) => person.department || "Operations").filter(Boolean))].sort(), [data.people]);
  const locations = useMemo(() => [...new Set(data.locations.map((location) => location.display_name).filter(Boolean))].sort(), [data.locations]);
  const branchPeopleOptions = useMemo(() => data.people
    .filter((person) => person.directory_status !== "inactive")
    .sort((a, b) => String(a.display_name || "").localeCompare(String(b.display_name || "")))
    .map((person) => ({ value: person.id, label: person.display_name })), [data.people]);
  const filteredChartPeople = useMemo(() => data.people.filter((person) => {
    if (chartFilters.group && (person.department || "Operations") !== chartFilters.group) return false;
    if (chartFilters.location && !formatLocations(person).split(", ").includes(chartFilters.location)) return false;
    return true;
  }), [chartFilters, data.people]);

  const chartModel = useMemo(() => ({
    people: filteredChartPeople,
    edges: data.edges,
    includeInactive,
    branchLayouts,
  }), [branchLayouts, data.edges, filteredChartPeople, includeInactive]);
  const chartNodes = useMemo(() => toBalkanNodes(chartModel), [chartModel]);

  useEffect(() => {
    if (isMobile) return undefined;
    let cancelled = false;
    async function mountChart() {
      if (!ref.current || !chartNodes.length) return;
      setFallback(false);
      setChartReady(false);
      setStatus("Preparing org chart");
      try {
        await loadBalkanOrgChart();
        if (cancelled || !ref.current) return;
        if (chartRef.current?.destroy) chartRef.current.destroy();
        ref.current.innerHTML = "";
        chartRef.current = createBalkanOrgChart(ref.current, chartModel, {
          highlightMode,
          navigationMode,
          layoutMode,
          miniMap,
          showContactFields,
          onNodeClick: onSelectPerson,
          onDrop: async ({ childPersonId, managerPersonId, dropId }) => {
            setMessage("");
            if (!childPersonId || !managerPersonId || !dropId?.startsWith("person:")) {
              setMessage("Drop onto a person card to change a manager.");
              return;
            }
            const validation = data.getManagerValidation({ childId: childPersonId, managerId: managerPersonId });
            if (!validation.valid) {
              setMessage(validation.reason);
              return;
            }
            try {
              await data.updateManager({ childId: childPersonId, managerId: managerPersonId });
              setMessage("Reporting line updated in Supabase.");
            } catch (error) {
              setMessage(error.message || "Reporting line update failed.");
            }
          },
        });
        setStatus("Generated from manual directory people and reports-to rows");
        window.setTimeout(() => {
          if (!cancelled) setChartReady(true);
        }, 250);
      } catch (err) {
        console.warn("[Enterprise Directory] Org chart fallback:", err);
        if (!cancelled) {
          setFallback(true);
          setChartReady(false);
          setStatus("BALKAN unavailable in this runtime. Showing hierarchy fallback.");
        }
      }
    }
    mountChart();
    return () => {
      cancelled = true;
      if (chartRef.current?.destroy) chartRef.current.destroy();
    };
  }, [chartModel, chartNodes.length, data, highlightMode, isMobile, layoutMode, miniMap, navigationMode, onSelectPerson, showContactFields]);

  const fitChart = () => chartRef.current?.fit?.();
  const zoom = (delta) => {
    const chart = chartRef.current;
    if (!chart?.getScale || !chart?.setScale) return;
    const next = Math.max(0.5, Math.min(1.9, chart.getScale() + delta));
    chart.setScale(next);
  };
  const centerSearch = () => {
    const needle = search.trim().toLowerCase();
    if (!needle || !chartRef.current) return;
    chartRef.current.search?.(search, ["name", "title", "phone", "email", "group", "location"], ["name", "title", "phone", "email", "group", "location"]);
    const match = chartNodes.find((node) => [node.name, node.title, node.group, node.location, node.email, node.phone].join(" ").toLowerCase().includes(needle));
    if (match) {
      chartRef.current.center?.(match.id);
      chartRef.current.highlightNode?.(match.id, highlightMode === "none" ? "parents" : highlightMode);
      setMessage(`Centered ${match.name}.`);
    } else {
      setMessage("No matching chart node.");
    }
  };
  const collapseAll = () => {
    const chart = chartRef.current;
    if (!chart?.collapse) return;
    chartNodes.forEach((node) => {
      const chartNode = chart.getNode?.(node.id);
      if (chartNode?.childrenIds?.length) chart.collapse(node.id, chartNode.childrenIds);
    });
  };
  const expandAll = () => {
    const chart = chartRef.current;
    if (!chart?.expand) return;
    chartNodes.forEach((node) => {
      const chartNode = chart.getNode?.(node.id);
      if (chartNode?.childrenIds?.length) chart.expand(node.id, chartNode.childrenIds);
    });
  };
  const applyBranchLayout = (layout) => {
    if (!branchPersonId) return;
    setBranchLayouts((current) => ({ ...current, [branchPersonId]: layout }));
  };
  const selectedBranchLayout = branchLayouts[branchPersonId] || data.peopleById.get(branchPersonId)?.org_chart_branch_layout || "standard_tree";
  const resetFilters = () => {
    setChartFilters({ group: "", location: "" });
    setSearch("");
    setMessage("");
  };

  return (
    <div className="dir-panel">
      <div className="dir-chart-head">
        <div className="dir-chart-title">
          <h2>Company Org Chart</h2>
          <p>{isMobile ? "Phone editing uses a directory tree and manager selector instead of dense canvas drag/drop." : status}</p>
        </div>
        <div className="dir-chart-actions" aria-label="Org chart controls">
          <span className="dir-pill">{chartNodes.length} nodes</span>
          <label className="dir-pill neutral" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} style={{ margin: 0 }} /> Include inactive
          </label>
          <label className={`dir-switch-chip ${showContactFields ? "active" : ""}`}>
            <input type="checkbox" checked={showContactFields} onChange={(event) => setShowContactFields(event.target.checked)} />
            <span className="dir-switch-track" aria-hidden="true" />
            Phone/email
          </label>
          {!isMobile && !fallback && (
            <>
              <SearchInput className="dir-chart-search" value={search} onChange={setSearch} placeholder="Search chart..." />
              <button className="dir-action" type="button" onClick={centerSearch} disabled={!chartReady}>Center</button>
              <div className="dir-settings">
                <button className="dir-action" type="button" onClick={() => setSettingsOpen((current) => !current)} disabled={!chartReady} aria-expanded={settingsOpen} aria-label="Org chart settings">
                  <I.Settings /> Settings
                </button>
                {settingsOpen && (
                  <div className="dir-settings-panel">
                    <div className="dir-settings-grid">
                      <div className="dir-settings-row">
                        <label>Filter by group</label>
                        <K9Select value={chartFilters.group} onChange={(value) => setChartFilters((current) => ({ ...current, group: value }))} options={makeOptions(groups)} placeholder="All groups" searchable />
                      </div>
                      <div className="dir-settings-row">
                        <label>Filter by location</label>
                        <K9Select value={chartFilters.location} onChange={(value) => setChartFilters((current) => ({ ...current, location: value }))} options={makeOptions(locations)} placeholder="All locations" searchable />
                      </div>
                      <div className="dir-settings-row">
                        <label>Highlight mode</label>
                        <K9Select value={highlightMode} onChange={setHighlightMode} options={HIGHLIGHT_OPTIONS} placeholder="Leadership path" />
                      </div>
                      <div className="dir-settings-row">
                        <label>Navigation mode</label>
                        <K9Select value={navigationMode} onChange={setNavigationMode} options={NAVIGATION_OPTIONS} placeholder="Scroll to zoom" />
                      </div>
                      <div className="dir-settings-row">
                        <label>Layout mode</label>
                        <K9Select value={layoutMode} onChange={setLayoutMode} options={LAYOUT_OPTIONS} placeholder="Balanced tree" />
                      </div>
                      <div className="dir-settings-row">
                        <label>Branch</label>
                        <K9Select value={branchPersonId} onChange={setBranchPersonId} options={branchPeopleOptions} placeholder="Choose branch leader" searchable />
                      </div>
                      <div className="dir-settings-row">
                        <label>Branch layout</label>
                        <K9Select value={selectedBranchLayout} onChange={applyBranchLayout} options={BRANCH_LAYOUT_OPTIONS} placeholder="Standard tree branch" />
                      </div>
                      <div className="dir-settings-row">
                        <label>Map</label>
                        <button className={`dir-action ${miniMap ? "primary" : ""}`} type="button" onClick={() => setMiniMap((current) => !current)}>
                          {miniMap ? "Mini Map On" : "Mini Map Off"}
                        </button>
                      </div>
                    </div>
                    <div className="dir-inline-note">
                      Side-by-side leaders, assistant placement, and compact branches are derived from directory relationship/presentation metadata. Reporting changes still save only through canonical Supabase reporting rows.
                    </div>
                    <div className="dir-settings-actions">
                      <button className="dir-action" type="button" onClick={resetFilters}>Clear Search/Filters</button>
                      <button className="dir-action primary" type="button" onClick={() => setSettingsOpen(false)}>Done</button>
                    </div>
                  </div>
                )}
              </div>
              <button className="dir-action" type="button" onClick={() => zoom(-0.15)} disabled={!chartReady} title="Zoom out" aria-label="Zoom out">-</button>
              <button className="dir-action" type="button" onClick={fitChart} disabled={!chartReady} title="Fit chart" aria-label="Fit chart"><I.RefreshCw /> Fit</button>
              <button className="dir-action" type="button" onClick={() => zoom(0.15)} disabled={!chartReady} title="Zoom in" aria-label="Zoom in"><I.Plus /></button>
              <button className="dir-action" type="button" onClick={collapseAll} disabled={!chartReady}>Collapse</button>
              <button className="dir-action" type="button" onClick={expandAll} disabled={!chartReady}>Expand</button>
            </>
          )}
        </div>
      </div>
      {message && <div className={message.includes("failed") || message.includes("cycle") || message.includes("Drop") || message.includes("No matching") ? "dir-inline-error" : "dir-inline-note"} style={{ margin: 12 }}>{message}</div>}
      <div className="dir-chart-shell">
        {isMobile || fallback ? (
          <MobileTreeView data={data} onSelectPerson={onSelectPerson} onEditPerson={onEditPerson} showContactFields={showContactFields} />
        ) : (
          <div ref={ref} className="dir-chart-card" aria-label="Company org chart" />
        )}
      </div>
    </div>
  );
}

export default function CompanyDirectory({ initialView = "people" }) {
  useDirectoryStyles();
  const data = useEnterpriseDirectory();
  const [activeView, setActiveView] = useState(initialView);
  const [drawer, setDrawer] = useState({ mode: null, personId: null });
  const [locationDrawer, setLocationDrawer] = useState({ mode: null, locationId: null });

  useEffect(() => {
    setActiveView(initialView);
  }, [initialView]);

  const selectedPerson = drawer.personId ? data.peopleById.get(drawer.personId) : null;
  const selectedLocation = locationDrawer.locationId ? data.locationsById.get(locationDrawer.locationId) : null;
  const openDetail = (personId) => setDrawer({ mode: "detail", personId });
  const openEdit = (personId) => setDrawer({ mode: "edit", personId });
  const openCreate = () => setDrawer({ mode: "create", personId: null });
  const closeDrawer = () => setDrawer({ mode: null, personId: null });
  const openLocationEdit = (locationId) => setLocationDrawer({ mode: "edit", locationId });
  const closeLocationDrawer = () => setLocationDrawer({ mode: null, locationId: null });
  const onSaved = (personId) => setDrawer({ mode: "detail", personId });
  const onLocationSaved = (locationId) => setLocationDrawer({ mode: "edit", locationId });

  if (data.loading) {
    return (
      <div className="dir-shell">
        <div className="dir-wrap" style={{ display: "grid", placeItems: "center", minHeight: 420 }}>
          <K9LoadingAnimation label="Loading company directory" />
        </div>
      </div>
    );
  }

  if (data.error && !data.people.length) {
    return (
      <div className="dir-shell">
        <div className="dir-wrap">
          <div className="dir-panel dir-empty">
            <h2 style={{ color: C.dan, marginTop: 0 }}>Directory failed to load</h2>
            <p>{data.error.message || "Supabase returned an error."}</p>
            <button className="dir-tab active" onClick={data.reload}><I.RefreshCw /> Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dir-shell">
      <div className="dir-wrap">
        <DirectoryHeader data={data} />
        <DirectoryTabs activeView={activeView} setActiveView={setActiveView} />
        {data.error && <div className="dir-inline-error" style={{ marginBottom: 12 }}>{data.error.message || "Directory operation failed."}</div>}
        {activeView === "people" && <PeopleView data={data} onSelectPerson={openDetail} onCreatePerson={openCreate} />}
        {activeView === "org" && <OrgChartView data={data} onSelectPerson={openDetail} onEditPerson={openEdit} />}
        {activeView === "resorts" && <ResortsView data={data} onSelectLocation={openLocationEdit} />}
        {activeView === "gaps" && <DataGapsView data={data} />}
      </div>
      <PersonDrawer data={data} person={selectedPerson} mode={drawer.mode} onClose={closeDrawer} onEdit={openEdit} onSaved={onSaved} />
      <LocationDrawer data={data} location={selectedLocation} mode={locationDrawer.mode} onClose={closeLocationDrawer} onSaved={onLocationSaved} />
    </div>
  );
}
