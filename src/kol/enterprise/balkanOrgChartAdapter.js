const BALKAN_ORGCHART_SRC = "/vendor/balkan-orgchart/orgchart.js";
const CORPORATE_GROUP_PLACEHOLDER = "Manager data to be refined as the directory matures";
const EXECUTIVE_ROOT_ID = "group:k9-executive-root";
const CORPORATE_SUPPORT_ID = "group:k9-corporate-support";
const EXCLUDED_DUPLICATE_EXECUTIVES = new Set(["group:co-ceos", "person:alan-leibman", "person:phil-nisbet"]);

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

export function toBalkanNodes(nodes = []) {
  return buildK9ChartNodes(nodes);
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

function shortenTitle(title = "", location = "") {
  if (title === CORPORATE_GROUP_PLACEHOLDER) return "Support team";
  if (/Director of Resorts/i.test(title) && /Cherry Hill/i.test(location)) return "Director of Resorts | GM Cherry Hill";
  if (/General Manager/i.test(title)) return "General Manager";
  return title || "";
}

function nodeTags(node) {
  const tags = new Set(asArray(node.tags));
  if (node.node_type === "person") tags.add("k9-person");
  if (/regional manager/i.test(node.title || "")) tags.add("k9-regional");
  if (/general manager/i.test(node.title || "")) tags.add("k9-gm");
  if (node.id === "person:lia-moncholi") tags.add("k9-coo");
  if (node.id === "person:sean-powell") tags.add("k9-resort-ops");
  if (node.id === "person:zack-nisbet") tags.add("k9-director");
  return [...tags];
}

function toDisplayNode(node) {
  const location = node.location_names || "";
  return {
    id: node.id,
    pid: node.pid || undefined,
    name: node.display_name || "Needs data",
    title: shortenTitle(node.title, location),
    email: node.email || "",
    phone: node.work_phone || "",
    location,
    tags: nodeTags(node),
  };
}

function buildK9ChartNodes(nodes = []) {
  const chartNodes = [{
    id: EXECUTIVE_ROOT_ID,
    name: "Alan Leibman + Phil Nisbet",
    title: "Co-CEOs",
    location: "Executive leadership",
    tags: ["k9-root"],
  }];

  nodes.forEach((node) => {
    if (EXCLUDED_DUPLICATE_EXECUTIVES.has(node.id)) return;

    if (node.id === "group:leadership") {
      chartNodes.push({
        id: CORPORATE_SUPPORT_ID,
        pid: EXECUTIVE_ROOT_ID,
        name: "LPHI Corporate Support",
        title: "Finance, marketing, training, real estate",
        location: "Collapsed to keep resort reporting readable",
        tags: ["k9-group", "k9-corporate"],
        collapsed: true,
      });
      return;
    }

    const displayNode = toDisplayNode(node);
    if (displayNode.pid === "group:co-ceos") displayNode.pid = EXECUTIVE_ROOT_ID;
    if (displayNode.pid === "group:leadership") return;
    chartNodes.push(displayNode);
  });

  return chartNodes;
}

function defineK9Templates(OrgChart) {
  if (OrgChart.templates.k9Person) return;

  const link = `<path stroke-linejoin="round" stroke="#AAB8A6" stroke-width="1.5px" fill="none" d="{rounded}" />`;
  const nodeMenuButton = `<g></g>`;

  OrgChart.templates.k9Person = Object.assign({}, OrgChart.templates.ana);
  OrgChart.templates.k9Person.size = [260, 118];
  OrgChart.templates.k9Person.link = link;
  OrgChart.templates.k9Person.node = (node) => `
    <rect x="0" y="0" height="${node.h}" width="${node.w}" fill="#FFFFFF" stroke="#DDE7DA" stroke-width="1.5" rx="8" ry="8"></rect>
    <rect x="0" y="0" height="8" width="${node.w}" fill="#0B5D1E" rx="8" ry="8"></rect>
    <rect x="0" y="7" height="3" width="${node.w}" fill="#0B5D1E"></rect>
  `;
  OrgChart.templates.k9Person.nodeMenuButton = nodeMenuButton;
  OrgChart.templates.k9Person.field_0 = (node, data, name, index, value) => (
    OrgChart.wrapText(value, `<text style="font-size: 18px; font-weight: 700;" fill="#142416" x="${node.w / 2}" y="38" text-anchor="middle"></text>`, node.w - 28, 2)
  );
  OrgChart.templates.k9Person.field_1 = (node, data, name, index, value) => (
    OrgChart.wrapText(value, `<text style="font-size: 13px; font-weight: 600;" fill="#536257" x="${node.w / 2}" y="72" text-anchor="middle"></text>`, node.w - 28, 2)
  );
  OrgChart.templates.k9Person.field_2 = (node, data, name, index, value) => (
    value ? OrgChart.wrapText(value, `<text style="font-size: 11px; font-weight: 600;" fill="#6F7D70" x="${node.w / 2}" y="99" text-anchor="middle"></text>`, node.w - 32, 1) : ""
  );
  OrgChart.templates.k9Person.plus = OrgChart.templates.ana.plus;
  OrgChart.templates.k9Person.minus = OrgChart.templates.ana.minus;

  OrgChart.templates.k9Root = Object.assign({}, OrgChart.templates.k9Person);
  OrgChart.templates.k9Root.size = [330, 128];
  OrgChart.templates.k9Root.node = (node) => `
    <rect x="0" y="0" height="${node.h}" width="${node.w}" fill="#0B5D1E" stroke="#064615" stroke-width="1.5" rx="8" ry="8"></rect>
    <rect x="12" y="12" height="${node.h - 24}" width="${node.w - 24}" fill="none" stroke="#94D82D" stroke-width="1" rx="6" ry="6" opacity="0.6"></rect>
  `;
  OrgChart.templates.k9Root.field_0 = (node, data, name, index, value) => (
    OrgChart.wrapText(value, `<text style="font-size: 21px; font-weight: 800;" fill="#FFFFFF" x="${node.w / 2}" y="46" text-anchor="middle"></text>`, node.w - 36, 2)
  );
  OrgChart.templates.k9Root.field_1 = (node, data, name, index, value) => (
    OrgChart.wrapText(value, `<text style="font-size: 15px; font-weight: 700;" fill="#D8F8A6" x="${node.w / 2}" y="84" text-anchor="middle"></text>`, node.w - 36, 1)
  );
  OrgChart.templates.k9Root.field_2 = (node, data, name, index, value) => (
    OrgChart.wrapText(value, `<text style="font-size: 12px; font-weight: 650;" fill="#F1F8EC" x="${node.w / 2}" y="106" text-anchor="middle"></text>`, node.w - 40, 1)
  );

  OrgChart.templates.k9Group = Object.assign({}, OrgChart.templates.k9Person);
  OrgChart.templates.k9Group.size = [280, 112];
  OrgChart.templates.k9Group.node = (node) => `
    <rect x="0" y="0" height="${node.h}" width="${node.w}" fill="#F3F8EF" stroke="#BBD8B1" stroke-width="1.5" rx="8" ry="8"></rect>
    <rect x="0" y="0" height="8" width="${node.w}" fill="#94D82D" rx="8" ry="8"></rect>
    <rect x="0" y="7" height="3" width="${node.w}" fill="#94D82D"></rect>
  `;
  OrgChart.templates.k9Group.field_0 = (node, data, name, index, value) => (
    OrgChart.wrapText(value, `<text style="font-size: 16px; font-weight: 800;" fill="#123817" x="${node.w / 2}" y="38" text-anchor="middle"></text>`, node.w - 32, 2)
  );
  OrgChart.templates.k9Group.field_1 = (node, data, name, index, value) => (
    OrgChart.wrapText(value, `<text style="font-size: 12px; font-weight: 650;" fill="#536257" x="${node.w / 2}" y="74" text-anchor="middle"></text>`, node.w - 32, 2)
  );
}

export function createBalkanOrgChart(element, nodes, options = {}) {
  if (!window.OrgChart) throw new Error("OrgChartJS is not loaded.");
  const OrgChart = window.OrgChart;
  defineK9Templates(OrgChart);
  const chartNodes = buildK9ChartNodes(nodes);
  const chart = new OrgChart(element, {
    template: "k9Person",
    enableSearch: false,
    searchUI: false,
    mouseScrool: OrgChart.action.zoom,
    layout: OrgChart.layout.mixed,
    scaleInitial: 0.72,
    scaleMin: 0.5,
    scaleMax: 1.8,
    padding: 54,
    siblingSeparation: 34,
    subtreeSeparation: 50,
    levelSeparation: 84,
    nodeBinding: {
      field_0: "name",
      field_1: "title",
      field_2: "location",
    },
    tags: {
      "k9-root": { template: "k9Root" },
      "k9-group": { template: "k9Group" },
      "k9-corporate": { template: "k9Group" },
      "k9-regional": { template: "k9Person" },
      "k9-gm": { template: "k9Person" },
    },
    ...options,
  });
  chart.load(chartNodes);
  return chart;
}
