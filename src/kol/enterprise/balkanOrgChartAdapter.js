import {
  asArray,
  formatLocations,
  getPrimaryManagerId,
  initials,
  isVacantRole,
} from "./companyDirectoryModel";

const BALKAN_ORGCHART_SRC = "/vendor/balkan-orgchart/orgchart.js";
const REPORTS_TO = "reports_to";
const ASSISTANT_RELATIONSHIPS = new Set(["assistant", "assistant_to"]);

let loadPromise = null;

export function loadBalkanOrgChart() {
  if (typeof window === "undefined") return Promise.reject(new Error("Org chart requires a browser runtime."));
  if (window.OrgChart) return Promise.resolve(window.OrgChart);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${BALKAN_ORGCHART_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.OrgChart));
      existing.addEventListener("error", () => reject(new Error("Balkan OrgChartJS failed to load.")));
      return;
    }

    const script = document.createElement("script");
    script.src = BALKAN_ORGCHART_SRC;
    script.async = true;
    script.onload = () => {
      if (window.OrgChart) resolve(window.OrgChart);
      else reject(new Error("Balkan OrgChartJS loaded without exposing OrgChart."));
    };
    script.onerror = () => reject(new Error("Balkan OrgChartJS failed to load."));
    document.head.appendChild(script);
  });

  return loadPromise;
}

function nodeId(personId) {
  return `person:${personId}`;
}

export function balkanNodeIdForPerson(personId) {
  return personId ? nodeId(personId) : "";
}

export function personIdFromBalkanNodeId(id) {
  const value = String(id || "");
  return value.startsWith("person:") ? value.slice("person:".length) : "";
}

function balkanNodeIdFromElement(element) {
  if (!element?.closest) return "";
  const node = element.closest("[data-n-id]");
  return node?.getAttribute("data-n-id") || "";
}

function balkanNodeIdFromDropEvent(event) {
  const directTarget = balkanNodeIdFromElement(event?.target);
  if (directTarget) return directTarget;
  if (!event || typeof document === "undefined") return "";

  const x = Number.isFinite(event.clientX) ? event.clientX : null;
  const y = Number.isFinite(event.clientY) ? event.clientY : null;
  if (x === null || y === null) return "";

  return balkanNodeIdFromElement(document.elementFromPoint(x, y));
}

function getCanonicalPrimaryManagerId(person, edges = []) {
  const managerId = getPrimaryManagerId(person);
  if (managerId) return managerId;
  const edge = asArray(edges).find((row) => (
    row.child_person_id === person.id
    && row.relationship_type === REPORTS_TO
    && row.is_primary !== false
  ));
  return edge?.parent_person_id || "";
}

function edgesByChild(edges = []) {
  const map = new Map();
  asArray(edges).forEach((edge) => {
    if (!edge?.child_person_id) return;
    const rows = map.get(edge.child_person_id) || [];
    rows.push(edge);
    map.set(edge.child_person_id, rows);
  });
  return map;
}

function normalizeBranchLayout(value) {
  if (value === "compact_list") return "compact_list";
  if (value === "compact_tree") return "compact_tree";
  return "standard_tree";
}

function emptyContact(value, emptyLabel) {
  return String(value || "").trim() || emptyLabel;
}

function escapeSvgAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeSvgText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function svgSafeId(value) {
  return String(value || "node")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "node";
}

function chartPhotoUrl(person) {
  return String(person?.photo_display_url || person?.profile_photo_url || "").trim();
}

export function toBalkanNodes({
  people = [],
  edges = [],
  includeInactive = false,
  branchLayouts = {},
} = {}) {
  const visiblePeople = asArray(people)
    .filter((person) => includeInactive || person.directory_status !== "inactive")
    .sort((a, b) => String(a.display_name || "").localeCompare(String(b.display_name || "")));

  const visibleIds = new Set(visiblePeople.map((person) => person.id));
  const relationshipRowsByChild = edgesByChild(edges);
  const partnerAnchorByPersonId = new Map();
  const partnerParentByChildId = new Map();
  const assistantParentByChildId = new Map();
  const chartNodes = [];

  visiblePeople.forEach((person) => {
    const reportEdges = asArray(relationshipRowsByChild.get(person.id))
      .filter((edge) => edge.relationship_type === REPORTS_TO && visibleIds.has(edge.parent_person_id))
      .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)));
    const primaryEdge = reportEdges.find((edge) => edge.is_primary !== false) || reportEdges[0];
    const secondaryEdge = reportEdges.find((edge) => edge.parent_person_id !== primaryEdge?.parent_person_id);
    if (primaryEdge?.parent_person_id && secondaryEdge?.parent_person_id) {
      partnerAnchorByPersonId.set(secondaryEdge.parent_person_id, primaryEdge.parent_person_id);
      partnerParentByChildId.set(person.id, secondaryEdge.parent_person_id);
    }

    const assistantEdge = asArray(relationshipRowsByChild.get(person.id))
      .find((edge) => ASSISTANT_RELATIONSHIPS.has(edge.relationship_type) && visibleIds.has(edge.parent_person_id));
    if (assistantEdge?.parent_person_id) assistantParentByChildId.set(person.id, assistantEdge.parent_person_id);
  });

  visiblePeople.forEach((person) => {
    const managerId = getCanonicalPrimaryManagerId(person, edges);
    const manualPartnerAnchorId = person.org_chart_display_role === "side_by_side_leader" ? person.org_chart_partner_person_id : "";
    const manualAssistantParentId = person.org_chart_display_role === "assistant" ? person.org_chart_partner_person_id : "";
    const partnerAnchorId = partnerAnchorByPersonId.get(person.id) || manualPartnerAnchorId;
    const assistantParentId = assistantParentByChildId.get(person.id) || manualAssistantParentId;
    const branchLayout = normalizeBranchLayout(branchLayouts[person.id] || person.org_chart_branch_layout);
    const managerBranchLayout = normalizeBranchLayout(branchLayouts[managerId]);
    const useSubtreeParent = managerId && visibleIds.has(managerId) && managerBranchLayout !== "standard_tree";
    const tags = [
      "k9-person",
      person.directory_status === "inactive" ? "k9-inactive" : null,
      person.directory_status === "needs_data" ? "k9-needs-data" : null,
      isVacantRole(person) ? "k9-vacant" : null,
      partnerAnchorId ? "right-partner" : null,
      assistantParentId || person.org_chart_display_role === "assistant" ? "assistant" : null,
      branchLayout === "compact_list" ? "k9-subtree-list" : null,
      branchLayout === "compact_tree" ? "k9-subtree-compact" : null,
    ].filter(Boolean);

    const node = {
      id: nodeId(person.id),
      person_id: person.id,
      name: person.display_name || "Needs data",
      title: person.title || "Needs title",
      group: person.department || person.person_type || "Operations",
      location: formatLocations(person),
      email: emptyContact(person.email, "No email"),
      phone: emptyContact(person.work_phone, "No phone"),
      photo_url: chartPhotoUrl(person),
      initials: initials(person.display_name),
      tags,
    };

    if (partnerAnchorId && visibleIds.has(partnerAnchorId)) {
      node.pid = nodeId(partnerAnchorId);
    } else if (assistantParentId && visibleIds.has(assistantParentId)) {
      node.pid = nodeId(assistantParentId);
    } else if (managerId && visibleIds.has(managerId)) {
      if (useSubtreeParent) node.stpid = nodeId(managerId);
      else node.pid = nodeId(managerId);
    }

    const partnerParentId = partnerParentByChildId.get(person.id);
    if (partnerParentId && visibleIds.has(partnerParentId)) node.ppid = nodeId(partnerParentId);

    chartNodes.push(node);
  });

  return chartNodes;
}

function avatarSvg({ data, x, y, size, fontSize = 13, ring = "#FFFFFF", fallbackFill = "#F7FEE7" }) {
  const photoUrl = data?.photo_url || "";
  const label = escapeSvgText(data?.initials || initials(data?.name || ""));
  const id = `k9-avatar-${svgSafeId(data?.id || data?.person_id || data?.name)}`;
  const radius = size / 2;
  const centerX = x + radius;
  const centerY = y + radius;

  if (photoUrl) {
    return `
      <clipPath id="${id}">
        <circle cx="${centerX}" cy="${centerY}" r="${radius - 1}"></circle>
      </clipPath>
      <circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="#F1F6EF" stroke="${ring}" stroke-width="4"></circle>
      <image href="${escapeSvgAttr(photoUrl)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"></image>
      <circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="none" stroke="${ring}" stroke-width="4"></circle>
    `;
  }

  return `
    <circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="${fallbackFill}" stroke="${ring}" stroke-width="4"></circle>
    <text style="font-size: ${fontSize}px; font-weight: 900; letter-spacing: 0;" fill="#14532D" x="${centerX}" y="${centerY + Math.round(fontSize / 3)}" text-anchor="middle">${label}</text>
  `;
}

function defineK9Templates(OrgChart, { showContactFields = false } = {}) {
  const link = `<path stroke-linejoin="round" stroke="#94A3B8" stroke-width="1.6px" fill="none" d="{rounded}" />`;
  const nodeMenuButton = `<g></g>`;
  const cardWidth = 312;
  const cardHeight = showContactFields ? 356 : 344;
  const avatarSize = showContactFields ? 136 : 172;
  const avatarY = showContactFields ? 24 : 24;
  const nameY = showContactFields ? 194 : 248;
  const titleY = showContactFields ? 226 : 286;
  const contactDividerY = 252;
  const phoneY = 280;
  const emailY = 304;

  OrgChart.templates.k9DirectoryPerson = Object.assign({}, OrgChart.templates.ana);
  OrgChart.templates.k9DirectoryPerson.size = [cardWidth, cardHeight];
  OrgChart.templates.k9DirectoryPerson.link = link;
  OrgChart.templates.k9DirectoryPerson.nodeMenuButton = nodeMenuButton;
  OrgChart.templates.k9DirectoryPerson.node = (node) => `
    <filter id="k9DirectoryCardShadow" x="-16%" y="-16%" width="132%" height="132%">
      <feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="#0F172A" flood-opacity="0.16"/>
    </filter>
    <rect class="boc-hoverable" x="1" y="1" height="${node.h - 2}" width="${node.w - 2}" fill="#14532D" stroke="#94A3B8" stroke-width="1.5" rx="8" ry="8" filter="url(#k9DirectoryCardShadow)"></rect>
    <circle cx="${node.w - 48}" cy="27" r="3.3" fill="#FFFFFF" opacity=".92"></circle>
    <circle cx="${node.w - 34}" cy="27" r="3.3" fill="#FFFFFF" opacity=".92"></circle>
    <circle cx="${node.w - 20}" cy="27" r="3.3" fill="#FFFFFF" opacity=".92"></circle>
    ${showContactFields ? `<rect x="32" y="${contactDividerY}" height="1" width="${node.w - 64}" fill="#FFFFFF" opacity=".22"></rect>` : ""}
  `;
  OrgChart.templates.k9DirectoryPerson.field_0 = (node, data, name, index, value) => (
    OrgChart.wrapText(value, `<text style="font-size: 25px; font-weight: 900;" fill="#FFFFFF" x="${node.w / 2}" y="${nameY}" text-anchor="middle"></text>`, node.w - 46, 1)
  );
  OrgChart.templates.k9DirectoryPerson.field_1 = (node, data, name, index, value) => (
    OrgChart.wrapText(value, `<text style="font-size: 17px; font-weight: 800;" fill="#F7FEE7" x="${node.w / 2}" y="${titleY}" text-anchor="middle"></text>`, node.w - 50, 2)
  );
  OrgChart.templates.k9DirectoryPerson.field_2 = (node, data, name, index, value) => (
    showContactFields
      ? OrgChart.wrapText(value, `<text style="font-size: 12px; font-weight: 800;" fill="${value === "No phone" ? "#D9F99D" : "#FFFFFF"}" x="${node.w / 2}" y="${phoneY}" text-anchor="middle"></text>`, node.w - 60, 1)
      : ""
  );
  OrgChart.templates.k9DirectoryPerson.field_3 = (node, data, name, index, value) => (
    showContactFields
      ? OrgChart.wrapText(value, `<text style="font-size: 12px; font-weight: 800;" fill="${value === "No email" ? "#D9F99D" : "#FFFFFF"}" x="${node.w / 2}" y="${emailY}" text-anchor="middle"></text>`, node.w - 60, 1)
      : ""
  );
  OrgChart.templates.k9DirectoryPerson.field_4 = (node, data) => (
    avatarSvg({ data, x: node.w / 2 - avatarSize / 2, y: avatarY, size: avatarSize, fontSize: showContactFields ? 34 : 40 })
  );
  OrgChart.templates.k9DirectoryPerson.plus = OrgChart.templates.ana.plus;
  OrgChart.templates.k9DirectoryPerson.minus = OrgChart.templates.ana.minus;

  OrgChart.templates.k9DirectoryTreeListItem = Object.assign({}, OrgChart.templates.k9DirectoryPerson);
  OrgChart.templates.k9DirectoryTreeListItem.size = [312, showContactFields ? 128 : 102];
  OrgChart.templates.k9DirectoryTreeListItem.node = (node) => `
    <rect class="boc-hoverable" x="1" y="1" height="${node.h - 2}" width="${node.w - 2}" fill="#14532D" stroke="#94A3B8" stroke-width="1.2" rx="8" ry="8"></rect>
    <circle cx="${node.w - 42}" cy="22" r="2.7" fill="#FFFFFF" opacity=".9"></circle>
    <circle cx="${node.w - 30}" cy="22" r="2.7" fill="#FFFFFF" opacity=".9"></circle>
    <circle cx="${node.w - 18}" cy="22" r="2.7" fill="#FFFFFF" opacity=".9"></circle>
  `;
  OrgChart.templates.k9DirectoryTreeListItem.field_0 = (node, data, name, index, value) => (
    OrgChart.wrapText(value, `<text style="font-size: 15px; font-weight: 900;" fill="#FFFFFF" x="76" y="32" text-anchor="start"></text>`, node.w - 112, 1)
  );
  OrgChart.templates.k9DirectoryTreeListItem.field_1 = (node, data, name, index, value) => (
    OrgChart.wrapText(value, `<text style="font-size: 11px; font-weight: 800;" fill="#F7FEE7" x="76" y="54" text-anchor="start"></text>`, node.w - 100, 1)
  );
  OrgChart.templates.k9DirectoryTreeListItem.field_2 = (node, data, name, index, value) => (
    showContactFields
      ? OrgChart.wrapText(value, `<text style="font-size: 10px; font-weight: 800;" fill="#FFFFFF" x="76" y="86" text-anchor="start"></text>`, 104, 1)
      : ""
  );
  OrgChart.templates.k9DirectoryTreeListItem.field_3 = (node, data, name, index, value) => (
    showContactFields
      ? OrgChart.wrapText(value, `<text style="font-size: 10px; font-weight: 800;" fill="#FFFFFF" x="188" y="86" text-anchor="start"></text>`, node.w - 208, 1)
      : ""
  );
  OrgChart.templates.k9DirectoryTreeListItem.field_4 = (node, data) => (
    avatarSvg({ data, x: 20, y: 24, size: 42, fontSize: 12, ring: "#FFFFFF" })
  );
}

export function createBalkanOrgChart(element, directoryModel, options = {}) {
  if (!window.OrgChart) throw new Error("OrgChartJS is not loaded.");
  const OrgChart = window.OrgChart;
  defineK9Templates(OrgChart, { showContactFields: Boolean(options.showContactFields) });

  const chartNodes = toBalkanNodes(directoryModel);
  const layoutByMode = {
    standard_tree: OrgChart.layout.normal,
    balanced_tree: OrgChart.layout.mixed,
    compact_tree: OrgChart.layout.tree,
  };
  const navigationByMode = {
    zoom: OrgChart.action.zoom,
    scroll: OrgChart.action.scroll,
    ctrl_zoom: OrgChart.action.ctrlZoom,
    vertical_scroll: OrgChart.action.yScroll,
  };
  const highlightOnHover = options.highlightMode && options.highlightMode !== "none" ? options.highlightMode : undefined;
  const chart = new OrgChart(element, {
    template: "k9DirectoryPerson",
    enableSearch: false,
    enableDragDrop: true,
    nodeMouseClick: OrgChart.action.none,
    mouseScrool: navigationByMode[options.navigationMode] || OrgChart.action.zoom,
    mouseScroll: navigationByMode[options.navigationMode] || OrgChart.action.zoom,
    layout: layoutByMode[options.layoutMode] || OrgChart.layout.mixed,
    miniMap: Boolean(options.miniMap),
    showXScroll: options.navigationMode === "scroll",
    showYScroll: options.navigationMode === "scroll" || options.navigationMode === "vertical_scroll",
    highlightOnHover,
    scaleInitial: 0.78,
    scaleMin: 0.45,
    scaleMax: 1.9,
    padding: 62,
    siblingSeparation: 40,
    subtreeSeparation: 66,
    levelSeparation: 104,
    assistantSeparation: 92,
    partnerNodeSeparation: 22,
    nodeBinding: {
      field_0: "name",
      field_1: "title",
      field_2: "phone",
      field_3: "email",
      field_4: "photo_url",
    },
    searchFields: ["name", "title", "phone", "email", "group", "location"],
    searchFieldsWeight: {
      name: 100,
      title: 70,
      email: 60,
      phone: 55,
      group: 35,
      location: 35,
    },
    searchDisplayField: "name",
    tags: {
      "k9-person": { template: "k9DirectoryPerson" },
      "k9-inactive": { template: "k9DirectoryPerson" },
      "k9-needs-data": { template: "k9DirectoryPerson" },
      "k9-vacant": { template: "k9DirectoryPerson" },
      "right-partner": { template: "k9DirectoryPerson" },
      assistant: { template: "k9DirectoryPerson" },
      "k9-subtree-compact": {
        template: "k9DirectoryPerson",
        subTreeConfig: {
          layout: OrgChart.layout.mixed,
          columns: 2,
          siblingSeparation: 22,
          subtreeSeparation: 38,
          levelSeparation: 72,
        },
      },
      "k9-subtree-list": {
        template: "k9DirectoryPerson",
        subTreeConfig: {
          layout: OrgChart.layout.treeList,
          template: "k9DirectoryTreeListItem",
          siblingSeparation: 10,
          subtreeSeparation: 24,
          levelSeparation: 42,
        },
      },
    },
  });

  if (options.onNodeClick) {
    chart.onNodeClick((args) => {
      const id = args?.node?.id;
      const personId = personIdFromBalkanNodeId(id);
      if (personId) options.onNodeClick(personId);
      return false;
    });
  }

  if (options.onDrop) {
    chart.onDrop((args) => {
      const dropId = args?.dropId || balkanNodeIdFromDropEvent(args?.event);
      options.onDrop({
        childPersonId: personIdFromBalkanNodeId(args?.dragId),
        managerPersonId: personIdFromBalkanNodeId(dropId),
        dragId: args?.dragId,
        dropId,
      });
      return false;
    });
  }

  chart.load(chartNodes);
  return chart;
}
