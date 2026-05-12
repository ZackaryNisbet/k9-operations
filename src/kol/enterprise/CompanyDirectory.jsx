import React, { useEffect, useMemo, useRef, useState } from "react";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import useEnterpriseDirectory from "../../hooks/useEnterpriseDirectory";
import { createBalkanOrgChart, loadBalkanOrgChart } from "./balkanOrgChartAdapter";

const VIEWS = [
  { key: "people", label: "People", icon: I.Users },
  { key: "org", label: "Org Chart", icon: I.Layers },
  { key: "resorts", label: "Resorts", icon: I.Home },
  { key: "gaps", label: "Data Gaps", icon: I.AlertTriangle },
];

const DIRECTORY_CSS = `
.dir-shell { min-height: calc(100vh - 72px); background: #F8FAF7; color: ${C.text}; }
.dir-wrap { max-width: 1440px; margin: 0 auto; padding: 28px; }
.dir-hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 24px; align-items: end; margin-bottom: 18px; }
.dir-eyebrow { font-size: 12px; font-weight: 800; color: ${C.pri}; text-transform: uppercase; letter-spacing: 0; margin-bottom: 8px; }
.dir-title { font-size: 34px; line-height: 1.05; margin: 0; color: ${C.text}; }
.dir-subtitle { margin: 10px 0 0; color: ${C.textSec}; max-width: 780px; font-size: 15px; line-height: 1.55; }
.dir-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(138px, 1fr)); gap: 10px; }
.dir-stat { background: #fff; border: 1px solid ${C.border}; border-radius: 8px; padding: 12px 14px; min-width: 0; }
.dir-stat strong { display: block; font-size: 24px; color: ${C.pri}; line-height: 1; }
.dir-stat span { display: block; margin-top: 6px; color: ${C.textSec}; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0; }
.dir-tabs { display: flex; gap: 8px; padding: 6px; background: #fff; border: 1px solid ${C.border}; border-radius: 8px; width: fit-content; margin-bottom: 18px; }
.dir-tab { border: none; border-radius: 6px; background: transparent; color: ${C.textSec}; font: inherit; font-size: 13px; font-weight: 800; padding: 10px 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
.dir-tab svg { width: 17px; height: 17px; }
.dir-tab.active { background: ${C.pri}; color: #fff; }
.dir-panel { background: #fff; border: 1px solid ${C.border}; border-radius: 8px; overflow: hidden; }
.dir-toolbar { display: grid; grid-template-columns: minmax(240px, 1.2fr) repeat(4, minmax(160px, 1fr)); gap: 10px; padding: 14px; border-bottom: 1px solid ${C.border}; background: #fff; }
.dir-search, .dir-select { height: 40px; border: 1px solid ${C.border}; border-radius: 8px; padding: 0 12px; font: inherit; font-size: 13px; color: ${C.text}; background: #fff; min-width: 0; }
.dir-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.dir-table th { text-align: left; color: ${C.textSec}; font-size: 11px; text-transform: uppercase; letter-spacing: 0; padding: 12px 16px; background: #F8FAF7; border-bottom: 1px solid ${C.border}; }
.dir-table td { padding: 14px 16px; border-bottom: 1px solid ${C.border}; vertical-align: middle; }
.dir-row { cursor: pointer; transition: background .12s; }
.dir-row:hover { background: ${C.priLt}; }
.dir-person { display: flex; align-items: center; gap: 12px; min-width: 0; }
.dir-avatar { width: 38px; height: 38px; border-radius: 8px; background: ${C.pri}; color: #fff; display: grid; place-items: center; font-weight: 900; font-size: 13px; flex: 0 0 auto; }
.dir-avatar.large { width: 64px; height: 64px; font-size: 20px; border-radius: 10px; }
.dir-name { font-weight: 850; color: ${C.text}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dir-muted { color: ${C.textSec}; font-size: 12px; line-height: 1.45; }
.dir-pill { display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border-radius: 999px; font-size: 11px; font-weight: 800; background: ${C.priLt}; color: ${C.pri}; white-space: nowrap; }
.dir-pill.warn { background: ${C.warnLt}; color: ${C.warn}; }
.dir-empty { padding: 42px; text-align: center; color: ${C.textSec}; }
.dir-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 12px; padding: 14px; }
.dir-resort { border: 1px solid ${C.border}; border-radius: 8px; padding: 16px; min-width: 0; background: #fff; }
.dir-resort h3 { margin: 0 0 4px; font-size: 17px; color: ${C.text}; }
.dir-resort-meta { display: grid; gap: 10px; margin-top: 14px; }
.dir-meta-label { font-size: 11px; font-weight: 800; color: ${C.textSec}; text-transform: uppercase; letter-spacing: 0; margin-bottom: 3px; }
.dir-gap-list { display: grid; gap: 10px; padding: 14px; }
.dir-gap { border: 1px solid ${C.border}; border-left: 4px solid ${C.warn}; border-radius: 8px; padding: 14px; background: #fff; }
.dir-gap h3 { margin: 0 0 5px; font-size: 15px; color: ${C.text}; }
.dir-chart-shell { padding: 14px; }
.dir-chart-card { height: 680px; border: 1px solid ${C.border}; border-radius: 8px; background: #fff; overflow: hidden; }
.dir-chart-status { padding: 12px 14px; color: ${C.textSec}; font-size: 13px; border-bottom: 1px solid ${C.border}; display: flex; justify-content: space-between; gap: 12px; align-items: center; }
.dir-fallback-tree { padding: 16px; max-height: 620px; overflow: auto; }
.dir-tree-row { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 10px; align-items: start; padding: 9px 0; border-bottom: 1px solid ${C.border}; }
.dir-drawer-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.28); z-index: 2000; }
.dir-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(460px, 100vw); background: #fff; z-index: 2001; box-shadow: -24px 0 70px rgba(15,23,42,.22); display: flex; flex-direction: column; }
.dir-drawer-head { padding: 22px; border-bottom: 1px solid ${C.border}; display: flex; gap: 14px; align-items: center; }
.dir-drawer-body { padding: 18px 22px 26px; overflow: auto; display: grid; gap: 16px; }
.dir-close { margin-left: auto; width: 34px; height: 34px; border-radius: 8px; border: 1px solid ${C.border}; background: #fff; cursor: pointer; color: ${C.textSec}; display: grid; place-items: center; }
.dir-detail-block { border: 1px solid ${C.border}; border-radius: 8px; padding: 14px; }
.dir-detail-block h4 { margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0; color: ${C.textSec}; }
@media (max-width: 980px) {
  .dir-wrap { padding: 18px; }
  .dir-hero { grid-template-columns: 1fr; }
  .dir-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dir-toolbar { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 620px) {
  .dir-title { font-size: 28px; }
  .dir-tabs { width: 100%; overflow-x: auto; }
  .dir-tab { flex: 1 0 auto; justify-content: center; }
  .dir-toolbar { grid-template-columns: 1fr; }
  .dir-table th:nth-child(3), .dir-table td:nth-child(3),
  .dir-table th:nth-child(4), .dir-table td:nth-child(4) { display: none; }
  .dir-chart-card { height: 560px; }
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

function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "K9";
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function formatManagers(person) {
  const managers = asArray(person?.managers);
  if (!managers.length) return "Needs data";
  return managers.map((manager) => manager.display_name).join(", ");
}

function formatLocations(person) {
  const locations = asArray(person?.locations);
  if (!locations.length) return "Corporate";
  return locations.map((location) => location.display_name).join(", ");
}

function Field({ label, children }) {
  return (
    <div>
      <div className="dir-meta-label">{label}</div>
      <div>{children || <span className="dir-muted">Needs data</span>}</div>
    </div>
  );
}

function PersonDrawer({ person, directReports, onClose }) {
  if (!person) return null;
  return (
    <>
      <div className="dir-drawer-backdrop" onClick={onClose} />
      <aside className="dir-drawer" aria-label="Person details">
        <div className="dir-drawer-head">
          <div className="dir-avatar large">{initials(person.display_name)}</div>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 22, color: C.text }}>{person.display_name}</h2>
            <div className="dir-muted">{person.title || "Needs data"}</div>
          </div>
          <button className="dir-close" onClick={onClose} aria-label="Close details"><I.X /></button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-detail-block">
            <h4>Directory Fields</h4>
            <div style={{ display: "grid", gap: 12 }}>
              <Field label="Email">{person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : null}</Field>
              <Field label="Work Phone">{person.work_phone ? <a href={`tel:${person.work_phone}`}>{person.work_phone}</a> : null}</Field>
              <Field label="Resort / Location">{formatLocations(person)}</Field>
              <Field label="Manager">{formatManagers(person)}</Field>
            </div>
          </div>
          <div className="dir-detail-block">
            <h4>Direct Reports</h4>
            {directReports.length ? (
              <div style={{ display: "grid", gap: 10 }}>
                {directReports.map((report) => (
                  <div key={report.id} className="dir-person">
                    <div className="dir-avatar">{initials(report.display_name)}</div>
                    <div>
                      <div className="dir-name">{report.display_name}</div>
                      <div className="dir-muted">{report.title || "Needs data"}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dir-muted">No direct reports listed.</div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function DirectoryHeader({ data }) {
  const missingGm = data.gaps.filter((gap) => gap.field_name === "general_manager").length;
  return (
    <div className="dir-hero">
      <div>
        <div className="dir-eyebrow">Enterprise View</div>
        <h1 className="dir-title">Company Directory</h1>
        <p className="dir-subtitle">
          Safe company contact data for LPHI leadership, regional operators, resort GMs, and location responsibility. Profile photos are ready for later without exposing HR notes, pay, or documents.
        </p>
      </div>
      <div className="dir-stat-grid" aria-label="Directory totals">
        <div className="dir-stat"><strong>{data.people.length}</strong><span>People</span></div>
        <div className="dir-stat"><strong>{data.locations.length}</strong><span>Resorts</span></div>
        <div className="dir-stat"><strong>{data.orgNodes.filter((node) => node.node_type === "person").length}</strong><span>Chart Nodes</span></div>
        <div className="dir-stat"><strong>{missingGm}</strong><span>Missing GMs</span></div>
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

function PeopleView({ data, onSelectPerson }) {
  const [filters, setFilters] = useState({ query: "", title: "", location: "", manager: "", status: "" });
  const people = data.searchPeople(filters);
  const titles = [...new Set(data.people.map((person) => person.title).filter(Boolean))].sort();
  const locations = [...new Set(data.locations.map((location) => location.display_name).filter(Boolean))].sort();
  const managers = [...new Set(data.people.flatMap((person) => asArray(person.managers).map((manager) => manager.display_name)).filter(Boolean))].sort();

  const update = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="dir-panel">
      <div className="dir-toolbar">
        <input className="dir-search" value={filters.query} onChange={update("query")} placeholder="Search name, title, email, resort, manager..." />
        <select className="dir-select" value={filters.title} onChange={update("title")}>
          <option value="">All titles</option>
          {titles.map((title) => <option key={title} value={title}>{title}</option>)}
        </select>
        <select className="dir-select" value={filters.location} onChange={update("location")}>
          <option value="">All locations</option>
          {locations.map((location) => <option key={location} value={location}>{location}</option>)}
        </select>
        <select className="dir-select" value={filters.manager} onChange={update("manager")}>
          <option value="">All managers</option>
          {managers.map((manager) => <option key={manager} value={manager}>{manager}</option>)}
        </select>
        <select className="dir-select" value={filters.status} onChange={update("status")}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="needs_data">Needs data</option>
        </select>
      </div>
      {people.length ? (
        <table className="dir-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Title</th>
              <th>Location</th>
              <th>Manager</th>
              <th>Contact</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id} className="dir-row" onClick={() => onSelectPerson(person)}>
                <td>
                  <div className="dir-person">
                    <div className="dir-avatar">{initials(person.display_name)}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="dir-name">{person.display_name}</div>
                      <div className="dir-muted">{person.email || "Needs data"}</div>
                    </div>
                  </div>
                </td>
                <td>{person.title || <span className="dir-pill warn">Needs data</span>}</td>
                <td><span className="dir-muted">{formatLocations(person)}</span></td>
                <td><span className={asArray(person.managers).length ? "dir-muted" : "dir-pill warn"}>{formatManagers(person)}</span></td>
                <td><span className="dir-muted">{person.work_phone || "Needs data"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="dir-empty">No directory people match those filters.</div>
      )}
    </div>
  );
}

function ResortsView({ data }) {
  const assignmentByLocation = useMemo(() => {
    const map = new Map();
    data.people.forEach((person) => {
      asArray(person.locations).forEach((location) => {
        const rows = map.get(location.id) || [];
        rows.push({ person, location });
        map.set(location.id, rows);
      });
    });
    return map;
  }, [data.people]);

  return (
    <div className="dir-panel">
      <div className="dir-grid">
        {data.locations.map((location) => {
          const assignments = assignmentByLocation.get(location.id) || [];
          const gm = assignments.find((row) => row.location.responsibility_type === "general_manager");
          const regional = assignments.find((row) => row.location.responsibility_type === "regional_manager");
          return (
            <section className="dir-resort" key={location.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <h3>{location.display_name}</h3>
                  <div className="dir-muted">{[location.city, location.state_code].filter(Boolean).join(", ") || "Needs address data"}</div>
                </div>
                <span className="dir-pill">{location.region_label || location.state_code || "Region"}</span>
              </div>
              <div className="dir-resort-meta">
                <Field label="General Manager">{gm?.person?.display_name || <span className="dir-pill warn">Needs data</span>}</Field>
                <Field label="Regional Manager">{regional?.person?.display_name || <span className="dir-pill warn">Needs data</span>}</Field>
                <Field label="Resort Contact">{location.resort_email || location.resort_phone}</Field>
                <Field label="Address">{[location.address_line1, location.address_line2].filter(Boolean).join(", ")}</Field>
              </div>
            </section>
          );
        })}
      </div>
    </div>
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

function buildFallbackRows(nodes) {
  const byPid = new Map();
  nodes.forEach((node) => {
    const rows = byPid.get(node.pid || "root") || [];
    rows.push(node);
    byPid.set(node.pid || "root", rows);
  });
  const out = [];
  function walk(pid, depth) {
    (byPid.get(pid) || []).forEach((node) => {
      out.push({ node, depth });
      walk(node.id, depth + 1);
    });
  }
  walk("root", 0);
  return out;
}

function OrgChartView({ data }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  const [status, setStatus] = useState("Loading Balkan OrgChartJS...");
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function mountChart() {
      if (!ref.current || !data.orgNodes.length) return;
      setFallback(false);
      setStatus("Loading Balkan OrgChartJS...");
      try {
        await loadBalkanOrgChart();
        if (cancelled || !ref.current) return;
        if (chartRef.current?.destroy) chartRef.current.destroy();
        ref.current.innerHTML = "";
        chartRef.current = createBalkanOrgChart(ref.current, data.orgNodes);
        setStatus("Org chart rendered from Supabase id/pid nodes.");
      } catch (err) {
        console.warn("[Enterprise Directory] Org chart fallback:", err);
        if (!cancelled) {
          setFallback(true);
          setStatus("Balkan unavailable in this runtime. Showing mobile-safe hierarchy fallback.");
        }
      }
    }
    mountChart();
    return () => {
      cancelled = true;
      if (chartRef.current?.destroy) chartRef.current.destroy();
    };
  }, [data.orgNodes]);

  const fallbackRows = useMemo(() => buildFallbackRows(data.orgNodes), [data.orgNodes]);

  return (
    <div className="dir-panel">
      <div className="dir-chart-status">
        <span>{status}</span>
        <span className="dir-pill">{data.orgNodes.length} nodes</span>
      </div>
      <div className="dir-chart-shell">
        {fallback ? (
          <div className="dir-fallback-tree">
            {fallbackRows.map(({ node, depth }) => (
              <div className="dir-tree-row" key={node.id} style={{ paddingLeft: depth * 20 }}>
                <strong>{node.display_name}</strong>
                <span className="dir-muted">{node.title || node.location_names || node.node_type}</span>
              </div>
            ))}
          </div>
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
  const [selectedPerson, setSelectedPerson] = useState(null);

  useEffect(() => {
    setActiveView(initialView);
  }, [initialView]);

  const directReports = selectedPerson ? (data.directReportsByManager.get(selectedPerson.id) || []) : [];

  if (data.loading) {
    return (
      <div className="dir-shell">
        <div className="dir-wrap" style={{ display: "grid", placeItems: "center", minHeight: 420 }}>
          <K9LoadingAnimation label="Loading company directory" />
        </div>
      </div>
    );
  }

  if (data.error) {
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
        {activeView === "people" && <PeopleView data={data} onSelectPerson={setSelectedPerson} />}
        {activeView === "org" && <OrgChartView data={data} />}
        {activeView === "resorts" && <ResortsView data={data} />}
        {activeView === "gaps" && <DataGapsView data={data} />}
      </div>
      <PersonDrawer person={selectedPerson} directReports={directReports} onClose={() => setSelectedPerson(null)} />
    </div>
  );
}
