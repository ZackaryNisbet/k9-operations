import { gid } from "../../../shared/theme";

export function buildProgramConfigDraft(config = {}) {
  return {
    resourceLinks: (config.resourceLinks || []).map((link) => ({
      id: link.id || gid("resource"),
      label: link.label || "",
      url: link.url || "",
    })),
    programSopSections: (config.programSopSections || []).map((section) => ({
      id: section.id || gid("section"),
      title: section.title || "",
      items: (section.items || []).map((item) => ({ id: gid("item"), text: item || "" })),
    })),
  };
}

export function stripProgramConfigDraft(draft = {}) {
  return {
    resourceLinks: (draft.resourceLinks || [])
      .map((link) => ({ label: String(link.label || "").trim(), url: String(link.url || "").trim() }))
      .filter((link) => link.label || link.url),
    programSopSections: (draft.programSopSections || [])
      .map((section) => ({
        title: String(section.title || "").trim(),
        items: (section.items || []).map((item) => String(item.text || "").trim()).filter(Boolean),
      }))
      .filter((section) => section.title || section.items.length),
  };
}
