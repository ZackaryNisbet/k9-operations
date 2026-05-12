const BALKAN_ORGCHART_SRC = "/vendor/balkan-orgchart/orgchart.js";
const CORPORATE_GROUP_PLACEHOLDER = "Manager data to be refined as the directory matures";

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
  return nodes.map((node) => ({
    id: node.id,
    pid: node.pid || undefined,
    name: node.display_name || "Needs data",
    title: node.title === CORPORATE_GROUP_PLACEHOLDER ? "Leadership and support roles" : (node.title || ""),
    email: node.email || "",
    phone: node.work_phone || "",
    location: node.location_names || "",
    tags: node.tags || [],
  }));
}

export function createBalkanOrgChart(element, nodes, options = {}) {
  if (!window.OrgChart) throw new Error("OrgChartJS is not loaded.");
  const OrgChart = window.OrgChart;
  const chart = new OrgChart(element, {
    template: "olivia",
    enableSearch: false,
    mouseScrool: OrgChart.action.zoom,
    scaleInitial: 0.5,
    siblingSeparation: 44,
    levelSeparation: 72,
    nodeBinding: {
      field_0: "name",
      field_1: "title",
      field_2: "location",
    },
    tags: {
      "executive-group": { template: "ula" },
      "corporate-group": { template: "ula" },
    },
    ...options,
  });
  chart.load(toBalkanNodes(nodes));
  return chart;
}
