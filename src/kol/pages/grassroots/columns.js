import { getGrassrootsPrimaryEventDate } from "../../grassrootsData";
import { fmtDate } from "./dateUtils";

export function usesBusinessCategoryColumn(categoryConfig) {
  return categoryConfig.id === "drops" || categoryConfig.id === "petProfessionalPartnerships";
}

export function usesNextDateColumn(categoryConfig) {
  return categoryConfig.id !== "events" && categoryConfig.id !== "drops";
}

export function getTrackerGridColumns(categoryConfig) {
  if (categoryConfig.id === "petProfessionalPartnerships") {
    return "42px minmax(210px, 1.7fr) minmax(125px, 0.75fr) minmax(130px, 0.8fr) minmax(120px, 0.7fr) 118px minmax(340px, 1.4fr)";
  }
  if (categoryConfig.id === "drops") {
    return "42px minmax(320px, 2.2fr) minmax(150px, 0.85fr) 118px minmax(370px, 1.5fr)";
  }
  if (categoryConfig.id === "events") {
    return "42px minmax(260px, 2fr) minmax(130px, 0.7fr) minmax(180px, 0.8fr) minmax(220px, 0.85fr)";
  }
  return "42px minmax(230px, 2fr) minmax(140px, 0.85fr) minmax(130px, 0.75fr) 118px minmax(370px, 1.5fr)";
}

export function getGrassrootsColumnMap(categoryId, subview = null) {
  const lastActivityDate = (t, acts = []) => {
    const d = [...acts].map((a) => a.activity_date || a.created_at).filter(Boolean).sort().pop();
    return d ? fmtDate(d) : "—";
  };
  const events = {
    headers: { organizer: "Organizer", event: "Event", eventDate: "Event Date", status: "Status", notes: "Notes", followUp: "Follow-Up", updates: "Updates" },
    show: { event: true, eventDate: true, status: true, notes: true, followUp: true },
    sortable: { eventDate: true, followUp: true },
    statusVariant: "pill",
    updatesMode: "log",
    allowEventLink: true,
    emptyText: "No events match. Add one or clear filters.",
    get: {},
  };
  if (categoryId === "all") {
    // Cross-category view: each row maps itself using its own category's config.
    return {
      headers: { organizer: "Organizer / Business", event: "Event / Category", eventDate: "Date", status: "Status", notes: "Notes", followUp: "Follow-Up", updates: "Updates" },
      show: { event: true, eventDate: true, status: true, notes: true, followUp: true },
      sortable: { eventDate: false, followUp: true },
      statusVariant: "pill",
      updatesMode: "log",
      allowEventLink: true,
      emptyText: "No grassroots targets match this view.",
      get: {
        organizer: (t, acts) => {
          const m = getGrassrootsColumnMap(t.category);
          return m.get.organizer ? m.get.organizer(t, acts) : (t.organizer || [t.first_name, t.last_name].filter(Boolean).join(" ") || t.name || t.contact_source || "—");
        },
        event: (t, acts) => {
          const m = getGrassrootsColumnMap(t.category);
          const val = m.show.event ? (m.get.event ? m.get.event(t, acts) : (t.name || "")) : "";
          const typeLabel = t.category === "drops" ? "Visit" : t.category === "events" ? "Event" : null;
          if (!typeLabel) return val;
          return val ? `${typeLabel}: ${val}` : typeLabel;
        },
        eventDate: (t, acts) => {
          const m = getGrassrootsColumnMap(t.category);
          if (!m.show.eventDate) return "";
          if (m.get.eventDate) return m.get.eventDate(t, acts);
          const d = getGrassrootsPrimaryEventDate(t);
          return d ? fmtDate(d) : "";
        },
      },
    };
  }
  if (categoryId === "drops" && subview === "activity") {
    return {
      headers: { organizer: "Business", event: "Category", eventDate: "Date", status: "", notes: "Notes", followUp: "", updates: "" },
      show: { event: true, eventDate: true, status: false, notes: true, followUp: false },
      sortable: { eventDate: false, followUp: false },
      statusVariant: "text",
      updatesMode: "edit",
      allowEventLink: false,
      emptyText: "No visit activity matches this view.",
      get: {
        organizer: (r) => r.businessName || "—",
        event: (r) => r.businessCategory || "—",
        eventDate: (r) => (r.activityDate ? fmtDate(r.activityDate) : "—"),
        // Outcome + notes are one thing now; show the note, falling back to a legacy
        // outcome value (and joining both if an old record has them separately).
        notes: (r) => [r.outcome, r.notes].filter(Boolean).join(" — ") || r.personSpokenWith || "",
      },
    };
  }
  if (categoryId === "drops") {
    return {
      headers: { organizer: "Business", event: "Category", eventDate: "Last Visit", status: "Status", notes: "Notes", followUp: "Follow-Up", updates: "Updates" },
      show: { event: true, eventDate: true, status: false, notes: false, followUp: true },
      sortable: { eventDate: false, followUp: true },
      statusVariant: "pill",
      updatesMode: "log",
      allowEventLink: false,
      emptyText: "No visit businesses match this view.",
      get: {
        organizer: (t) => t.name || "—",
        event: (t) => t.business_category || "—",
        eventDate: (t, acts) => lastActivityDate(t, acts),
      },
    };
  }
  if (categoryId === "corporatePartnerships" || categoryId === "corporate_partnerships") {
    return {
      headers: { organizer: "Corporation", event: "Employees", eventDate: "", status: "Status", notes: "Notes", followUp: "Follow-Up", updates: "Updates" },
      show: { event: true, eventDate: false, status: true, notes: true, followUp: true },
      sortable: { eventDate: false, followUp: true },
      statusVariant: "pill",
      updatesMode: "log",
      allowEventLink: false,
      emptyText: "No corporate partnerships match this view.",
      get: {
        organizer: (t) => t.name || "—",
        event: (t) => {
          const loc = t.local_employees, us = t.us_employees;
          if (!loc && !us) return "—";
          return [loc ? `${loc} local` : null, us ? `${us} US` : null].filter(Boolean).join(" · ");
        },
        eventDate: () => "",
      },
    };
  }
  if (categoryId === "apartments") {
    return {
      headers: { organizer: "Apartment Complex", event: "", eventDate: "", status: "Status", notes: "Notes", followUp: "Follow-Up", updates: "Updates" },
      show: { event: false, eventDate: false, status: true, notes: true, followUp: true },
      sortable: { eventDate: false, followUp: true },
      statusVariant: "pill",
      updatesMode: "log",
      allowEventLink: false,
      emptyText: "No apartments match this view.",
      get: { organizer: (t) => t.name || "—", eventDate: () => "" },
    };
  }
  if (categoryId === "petProfessionalPartnerships" || categoryId === "pet_professional_partnerships") {
    return {
      headers: { organizer: "Business", event: "Category", eventDate: "", status: "Status", notes: "Notes", followUp: "Follow-Up", updates: "Updates" },
      show: { event: true, eventDate: false, status: true, notes: true, followUp: true },
      sortable: { eventDate: false, followUp: true },
      statusVariant: "pill",
      updatesMode: "log",
      allowEventLink: false,
      emptyText: "No pet professional partnerships match this view.",
      get: {
        organizer: (t) => t.name || "—",
        event: (t) => t.business_category || "—",
        eventDate: () => "",
      },
    };
  }
  if (categoryId === "localBusinessPartnerships" || categoryId === "local_business_partnerships") {
    return {
      headers: { organizer: "Business", event: "Category", eventDate: "", status: "Status", notes: "Notes", followUp: "Follow-Up", updates: "Updates" },
      show: { event: true, eventDate: false, status: true, notes: true, followUp: true },
      sortable: { eventDate: false, followUp: true },
      statusVariant: "pill",
      updatesMode: "log",
      allowEventLink: false,
      emptyText: "No local business partnerships match this view.",
      get: {
        organizer: (t) => t.name || "—",
        event: (t) => t.business_category || "—",
        eventDate: () => "",
      },
    };
  }
  if (categoryId === "schools") {
    return {
      headers: { organizer: "School", event: "", eventDate: "", status: "Status", notes: "Notes", followUp: "Follow-Up", updates: "Updates" },
      show: { event: false, eventDate: false, status: true, notes: true, followUp: true },
      sortable: { eventDate: false, followUp: true },
      statusVariant: "pill",
      updatesMode: "log",
      allowEventLink: false,
      emptyText: "No schools match this view.",
      get: { organizer: (t) => t.name || "—", eventDate: () => "" },
    };
  }
  return events;
}
