import { describe, expect, it } from "vitest";
import { toBalkanNodes } from "../kol/enterprise/balkanOrgChartAdapter";
import { getManagerValidation, wouldCreateCycle } from "../kol/enterprise/companyDirectoryModel";

const people = [
  { id: "alan", display_name: "Alan Leibman", title: "Co-CEO", directory_status: "active", department: "Executive", locations: [] },
  { id: "lia", display_name: "Lia Moncholi", title: "COO", directory_status: "active", department: "Operations", locations: [] },
  { id: "sean", display_name: "Sean Powell", title: "VP Resort Operations", directory_status: "active", department: "Operations", locations: [] },
  { id: "inactive", display_name: "Inactive Manager", title: "Former Manager", directory_status: "inactive", department: "Operations", locations: [] },
];

const edges = [
  { id: "e1", parent_person_id: "alan", child_person_id: "lia", relationship_type: "reports_to", is_primary: true },
  { id: "e2", parent_person_id: "lia", child_person_id: "sean", relationship_type: "reports_to", is_primary: true },
];

describe("company directory canonical org model", () => {
  it("maps Supabase people and reports_to edges into Balkan id/pid nodes", () => {
    const nodes = toBalkanNodes({ people, edges, directReportsByManager: new Map() });
    const lia = nodes.find((node) => node.person_id === "lia");
    const sean = nodes.find((node) => node.person_id === "sean");

    expect(lia).toMatchObject({ id: "person:lia", pid: "person:alan", name: "Lia Moncholi" });
    expect(sean).toMatchObject({ id: "person:sean", pid: "person:lia", name: "Sean Powell" });
  });

  it("does not create a visible synthetic K9 Operations root", () => {
    const nodes = toBalkanNodes({ people, edges: [] });
    expect(nodes.some((node) => node.name === "K9 Operations")).toBe(false);
    expect(nodes.every((node) => node.id.startsWith("person:"))).toBe(true);
  });

  it("passes Supabase profile photos and initials into org chart render metadata", () => {
    const nodes = toBalkanNodes({
      people: [
        { ...people[0], photo_display_url: "https://example.com/alan.jpg" },
        { ...people[1], profile_photo_url: "https://example.com/lia.jpg" },
      ],
      edges: [],
    });

    expect(nodes.find((node) => node.person_id === "alan")).toMatchObject({
      photo_url: "https://example.com/alan.jpg",
      initials: "AL",
    });
    expect(nodes.find((node) => node.person_id === "lia")).toMatchObject({
      photo_url: "https://example.com/lia.jpg",
      initials: "LM",
    });
  });

  it("uses partner render metadata for secondary co-leader edges without changing reports_to", () => {
    const nodes = toBalkanNodes({
      people: [
        ...people,
        { id: "phil", display_name: "Phil Nisbet", title: "Co-CEO", directory_status: "active", department: "Executive", locations: [] },
      ],
      edges: [
        { id: "e1", parent_person_id: "alan", child_person_id: "lia", relationship_type: "reports_to", is_primary: true },
        { id: "e2", parent_person_id: "phil", child_person_id: "lia", relationship_type: "reports_to", is_primary: false },
      ],
    });
    const phil = nodes.find((node) => node.person_id === "phil");
    const lia = nodes.find((node) => node.person_id === "lia");

    expect(phil).toMatchObject({ pid: "person:alan" });
    expect(phil.tags).toContain("right-partner");
    expect(lia).toMatchObject({ pid: "person:alan", ppid: "person:phil" });
  });

  it("derives side-by-side leader and assistant placement from K9 presentation metadata", () => {
    const nodes = toBalkanNodes({
      people: [
        ...people,
        {
          id: "phil",
          display_name: "Phil Nisbet",
          title: "Co-CEO",
          directory_status: "active",
          department: "Executive",
          locations: [],
          org_chart_display_role: "side_by_side_leader",
          org_chart_partner_person_id: "alan",
        },
        {
          id: "assistant",
          display_name: "Executive Assistant",
          title: "Assistant",
          directory_status: "active",
          department: "Executive",
          locations: [],
          org_chart_display_role: "assistant",
          org_chart_partner_person_id: "alan",
        },
      ],
      edges,
    });
    const phil = nodes.find((node) => node.person_id === "phil");
    const assistant = nodes.find((node) => node.person_id === "assistant");

    expect(phil).toMatchObject({ pid: "person:alan" });
    expect(phil.tags).toContain("right-partner");
    expect(assistant).toMatchObject({ pid: "person:alan" });
    expect(assistant.tags).toContain("assistant");
  });

  it("does not include inactive people in the chart unless requested", () => {
    expect(toBalkanNodes({ people, edges }).some((node) => node.person_id === "inactive")).toBe(false);
    expect(toBalkanNodes({ people, edges, includeInactive: true }).some((node) => node.person_id === "inactive")).toBe(true);
  });

  it("detects illegal reporting cycles before persistence", () => {
    expect(wouldCreateCycle({ childId: "alan", managerId: "sean", edges })).toBe(true);
    expect(wouldCreateCycle({ childId: "sean", managerId: "alan", edges })).toBe(false);
  });

  it("rejects inactive managers and self-reporting", () => {
    expect(getManagerValidation({ people, edges, childId: "sean", managerId: "sean" })).toMatchObject({ valid: false });
    expect(getManagerValidation({ people, edges, childId: "sean", managerId: "inactive" })).toMatchObject({ valid: false });
  });
});
