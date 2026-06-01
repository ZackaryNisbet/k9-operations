import { describe, expect, it } from "vitest";
import {
  buildDirectoryAttachmentPath,
  buildDirectoryContactPayload,
  buildDirectoryEntries,
  buildDirectoryImportCandidates,
  buildDirectoryNotePayload,
  buildDirectoryOrgPayload,
  buildDirectoryUpdatesFeed,
  groupDirectoryNotesByOrg,
  buildGrassrootsTargetWriteback,
  countDirectoryPairedTargets,
  getDirectoryLastInteractedAt,
  diffDirectoryPeople,
  makeOrgDraftFromIndividual,
  filterDirectoryEntries,
  formatDirectoryFileSize,
  getDirectoryAttachmentPreviewKind,
  getDirectoryBusinessCard,
  getDirectoryContactInitials,
  getDirectoryContactName,
  getDirectoryHistoryEventColor,
  getDirectoryHistoryEventLabel,
  getDirectoryOrgAddressText,
  getDirectoryOrgName,
  groupDirectoryAttachments,
  groupDirectoryContactsByOrg,
  groupDirectoryHistoryByDay,
  inferDirectoryAttachmentMimeType,
  isHeicFile,
  makeBlankDirectoryContact,
  makeBlankDirectoryOrg,
  sanitizeDirectoryAttachmentFilename,
  splitPersonName,
  summarizeDirectory,
  summarizeDirectoryHistoryEntry,
  validateDirectoryAttachmentFiles,
} from "../kol/marketingDirectoryData";

const LOC = "11111111-1111-4111-8111-111111111111";
const ORG_A = "22222222-2222-4222-8222-222222222222";
const ORG_B = "33333333-3333-4333-8333-333333333333";
const CON_A = "44444444-4444-4444-8444-444444444444";
const ATT_A = "55555555-5555-4555-8555-555555555555";
const TGT_A = "66666666-6666-4666-8666-666666666666";

describe("splitPersonName", () => {
  it("splits a multi-token name into given name + surname", () => {
    expect(splitPersonName("Dr. Jane A. Vance")).toEqual({ first_name: "Dr. Jane A.", last_name: "Vance" });
  });
  it("treats a single token as the first name", () => {
    expect(splitPersonName("Cher")).toEqual({ first_name: "Cher", last_name: "" });
  });
  it("returns empty parts for blank input", () => {
    expect(splitPersonName("   ")).toEqual({ first_name: "", last_name: "" });
  });
});

describe("blank drafts", () => {
  it("makes an org draft flagged isDraft with the location stamped", () => {
    const draft = makeBlankDirectoryOrg(LOC);
    expect(draft.isDraft).toBe(true);
    expect(draft.location_id).toBe(LOC);
    expect(draft.name).toBe("");
  });
  it("makes a contact draft linked to an org", () => {
    const draft = makeBlankDirectoryContact(LOC, ORG_A);
    expect(draft.org_id).toBe(ORG_A);
    expect(draft.isDraft).toBe(true);
  });
  it("makes a standalone individual draft with null org", () => {
    expect(makeBlankDirectoryContact(LOC).org_id).toBe(null);
  });
});

describe("display helpers", () => {
  it("falls back to a placeholder org name", () => {
    expect(getDirectoryOrgName({ name: "  " })).toBe("Untitled organization");
    expect(getDirectoryOrgName({ name: "Lincoln Park Vet" })).toBe("Lincoln Park Vet");
  });
  it("composes and falls back contact names", () => {
    expect(getDirectoryContactName({ first_name: "Jane", last_name: "Vance" })).toBe("Jane Vance");
    expect(getDirectoryContactName({})).toBe("Unnamed contact");
  });
  it("derives initials", () => {
    expect(getDirectoryContactInitials({ first_name: "Jane", last_name: "Vance" })).toBe("JS");
    expect(getDirectoryContactInitials({})).toBe("?");
  });
  it("prefers the split address, falling back to the raw address", () => {
    expect(getDirectoryOrgAddressText({ address_line_1: "1 Main St", address_city: "Remy Calloway", address_state: "IL" }))
      .toBe("1 Main St · Remy Calloway, IL");
    expect(getDirectoryOrgAddressText({ address: "5 Elm Rd" })).toBe("5 Elm Rd");
  });
});

describe("payload builders", () => {
  it("stamps created + updated actor on a new org and coerces blanks to null", () => {
    const payload = buildDirectoryOrgPayload(
      { isDraft: true, name: " The Vet ", org_type: "", phone: "555" },
      LOC,
      { userId: CON_A, name: "Zoe" },
    );
    expect(payload).toMatchObject({
      location_id: LOC,
      name: "The Vet",
      org_type: null,
      phone: "555",
      created_by_name: "Zoe",
      updated_by_name: "Zoe",
    });
  });
  it("omits created actor when updating an existing org", () => {
    const payload = buildDirectoryOrgPayload({ isDraft: false, name: "X" }, LOC, { name: "Zoe" });
    expect(payload).not.toHaveProperty("created_by_name");
    expect(payload.updated_by_name).toBe("Zoe");
  });
  it("builds a contact payload, dropping an invalid org id to null", () => {
    const payload = buildDirectoryContactPayload(
      { isDraft: true, first_name: "Jane", org_id: "not-a-uuid" },
      LOC,
      {},
    );
    expect(payload.org_id).toBe(null);
    expect(payload.first_name).toBe("Jane");
  });
});

describe("buildGrassrootsTargetWriteback", () => {
  it("only includes non-empty shared fields", () => {
    expect(buildGrassrootsTargetWriteback({ phone: "555", email: "", address_line_1: "1 Main St" }))
      .toEqual({ contact_phone: "555", address: "1 Main St" });
  });
  it("is empty when nothing is shareable", () => {
    expect(buildGrassrootsTargetWriteback({})).toEqual({});
  });
});

describe("attachment helpers", () => {
  it("infers mime types from extensions when type is missing", () => {
    expect(inferDirectoryAttachmentMimeType({ name: "card.HEIC" })).toBe("image/heic");
    expect(inferDirectoryAttachmentMimeType({ name: "flyer.pdf" })).toBe("application/pdf");
    expect(inferDirectoryAttachmentMimeType({ type: "image/png", name: "x" })).toBe("image/png");
  });
  it("detects heic files by type or extension", () => {
    expect(isHeicFile({ type: "image/heic" })).toBe(true);
    expect(isHeicFile({ name: "a.HEIF" })).toBe(true);
    expect(isHeicFile({ type: "image/png", name: "a.png" })).toBe(false);
  });
  it("sanitizes filenames and strips path segments", () => {
    expect(sanitizeDirectoryAttachmentFilename("../../etc/My Card!.png")).toBe("My-Card-.png");
    expect(sanitizeDirectoryAttachmentFilename("")).toBe("attachment");
  });
  it("builds a scoped storage path for orgs and contacts", () => {
    expect(buildDirectoryAttachmentPath({ locationId: LOC, entityType: "org", entityId: ORG_A, attachmentId: ATT_A, fileName: "card.jpg" }))
      .toBe(`${LOC}/orgs/${ORG_A}/${ATT_A}-card.jpg`);
    expect(buildDirectoryAttachmentPath({ locationId: LOC, entityType: "contact", entityId: CON_A, attachmentId: ATT_A, fileName: "x.pdf" }))
      .toBe(`${LOC}/contacts/${CON_A}/${ATT_A}-x.pdf`);
  });
  it("throws on an invalid entity type or missing ids", () => {
    expect(() => buildDirectoryAttachmentPath({ locationId: LOC, entityType: "bogus", entityId: ORG_A, attachmentId: ATT_A })).toThrow();
    expect(() => buildDirectoryAttachmentPath({ locationId: "", entityType: "org", entityId: ORG_A, attachmentId: ATT_A })).toThrow();
  });
  it("validates files by type, size, and count", () => {
    const ok = { name: "a.png", type: "image/png", size: 1000 };
    const tooBig = { name: "b.png", type: "image/png", size: 21 * 1024 * 1024 };
    const wrong = { name: "c.txt", type: "text/plain", size: 5 };
    const result = validateDirectoryAttachmentFiles([ok, tooBig, wrong]);
    expect(result.acceptedFiles).toEqual([ok]);
    expect(result.errors).toHaveLength(2);
  });
  it("formats file sizes", () => {
    expect(formatDirectoryFileSize(0)).toBe("");
    expect(formatDirectoryFileSize(512)).toBe("512 B");
    expect(formatDirectoryFileSize(2048)).toBe("2 KB");
    expect(formatDirectoryFileSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
  it("classifies preview kind", () => {
    expect(getDirectoryAttachmentPreviewKind({ mime_type: "application/pdf" })).toBe("pdf");
    expect(getDirectoryAttachmentPreviewKind({ file_name: "x.jpg" })).toBe("image");
    expect(getDirectoryAttachmentPreviewKind({ mime_type: "text/plain", file_name: "x.txt" })).toBe("unsupported");
  });
  it("groups attachments by parent and picks the business card avatar", () => {
    const card = { id: "c1", org_id: ORG_A, attachment_type: "business_card", uploaded_at: "2026-01-02" };
    const file = { id: "f1", org_id: ORG_A, attachment_type: "attachment", uploaded_at: "2026-01-03" };
    const deleted = { id: "d1", org_id: ORG_A, attachment_type: "attachment", deleted_at: "2026-01-04" };
    const grouped = groupDirectoryAttachments([card, file, deleted]);
    expect(grouped[`org:${ORG_A}`].map((a) => a.id)).toEqual(["f1", "c1"]); // newest first, deleted dropped
    expect(getDirectoryBusinessCard(grouped[`org:${ORG_A}`]).id).toBe("c1");
  });
});

describe("directory entry assembly", () => {
  const orgs = [
    { id: ORG_A, name: "Acme Vet", org_type: "Veterinarian" },
    { id: ORG_B, name: "Bark Groomers", org_type: "Groomer" },
  ];
  const contacts = [
    { id: CON_A, org_id: ORG_A, first_name: "Jane", last_name: "Vance", title: "Manager" },
    { id: "c-ind", org_id: null, first_name: "Solo", last_name: "Walker", title: "Influencer" },
  ];

  it("separates affiliated contacts from individuals", () => {
    const { byOrg, individuals } = groupDirectoryContactsByOrg(contacts);
    expect(byOrg.get(ORG_A).map((c) => c.id)).toEqual([CON_A]);
    expect(individuals.map((c) => c.id)).toEqual(["c-ind"]);
  });

  it("builds sorted org + individual entries with nested contacts and attachments", () => {
    const entries = buildDirectoryEntries({
      orgs,
      contacts,
      attachmentsByEntity: { [`org:${ORG_A}`]: [{ id: "att" }] },
    });
    expect(entries.map((e) => e.sortName)).toEqual(["acme vet", "bark groomers", "solo walker"]);
    const acme = entries.find((e) => e.id === ORG_A);
    expect(acme.kind).toBe("org");
    expect(acme.contacts).toHaveLength(1);
    expect(acme.attachments).toHaveLength(1);
    expect(entries.find((e) => e.id === "c-ind").kind).toBe("individual");
  });

  it("filters by entry type and search query", () => {
    const entries = buildDirectoryEntries({ orgs, contacts });
    expect(filterDirectoryEntries(entries, { entryType: "organizations" })).toHaveLength(2);
    expect(filterDirectoryEntries(entries, { entryType: "individuals" })).toHaveLength(1);
    // query matches an affiliated contact's name through the parent org
    expect(filterDirectoryEntries(entries, { query: "jane" }).map((e) => e.id)).toEqual([ORG_A]);
    // query matches the org type
    expect(filterDirectoryEntries(entries, { query: "groomer" }).map((e) => e.id)).toEqual([ORG_B]);
  });

  it("summarizes counts", () => {
    expect(summarizeDirectory(orgs, contacts)).toEqual({
      organizations: 2,
      individuals: 1,
      affiliatedContacts: 1,
      contacts: 2,
    });
  });
});

describe("buildDirectoryImportCandidates", () => {
  const targets = [
    { id: TGT_A, category: "drops", name: "Happy Paws", business_category: "Groomer", contact_phone: "555", first_name: "Pat", last_name: "Lee" },
    { id: "t-event", category: "events", name: "Spring Fair", organizer: "Jordan Avery" },
    { id: "t-corp", category: "corporate_partnerships", name: "Globex" },
    { id: "t-misc", category: "events", name: "No Organizer Fair", organizer: "" },
  ];

  it("maps org-like targets AND event organizers to org candidates (no individuals)", () => {
    const { orgs, individuals } = buildDirectoryImportCandidates({ targets });
    expect(orgs.map((o) => o.name)).toEqual(["Globex", "Happy Paws", "Jordan Avery"]);
    const paws = orgs.find((o) => o.name === "Happy Paws");
    expect(paws.org_type).toBe("Groomer");
    expect(paws.grassroots_target_id).toBe(TGT_A);
    expect(paws.contact).toMatchObject({ first_name: "Pat", last_name: "Lee" });
    expect(orgs.find((o) => o.name === "Jordan Avery").sourceLabel).toBe("Event organizer");
    expect(individuals).toHaveLength(0);
  });

  it("skips targets already linked by id or matched by name", () => {
    const existingOrgs = [
      { id: ORG_A, name: "happy   paws", grassroots_target_id: null },
      { id: ORG_B, name: "Jordan Avery", grassroots_target_id: null },
    ];
    const { orgs } = buildDirectoryImportCandidates({ targets, existingOrgs });
    expect(orgs.map((o) => o.name)).toEqual(["Globex"]); // Happy Paws + Jordan Avery deduped by name
  });
});

describe("countDirectoryPairedTargets", () => {
  it("counts tracker records linked by id or matched by name/organizer", () => {
    const targets = [
      { id: TGT_A, name: "Whatever", organizer: "" },
      { id: "x", category: "events", name: "Spring Fair", organizer: "Acme Vet" },
      { id: "y", category: "drops", name: "Acme Vet" },
      { id: "z", category: "drops", name: "Unrelated" },
    ];
    expect(countDirectoryPairedTargets({ id: ORG_A, name: "Acme Vet", grassroots_target_id: TGT_A }, targets)).toBe(3);
    expect(countDirectoryPairedTargets({ id: ORG_A, name: "Nobody" }, targets)).toBe(0);
  });
});

describe("getDirectoryLastInteractedAt", () => {
  it("returns the most recent of org / history / linked-target stamps", () => {
    const org = { id: ORG_A, name: "Acme", grassroots_target_id: TGT_A, updated_at: "2026-05-01T00:00:00Z" };
    const history = [{ entity_id: ORG_A, event_at: "2026-05-10T00:00:00Z" }, { entity_id: ORG_B, event_at: "2026-12-01T00:00:00Z" }];
    const targets = [{ id: TGT_A, last_contact_date: "2026-05-20" }];
    expect(getDirectoryLastInteractedAt(org, { history, targets })).toBe("2026-05-20");
  });
  it("returns empty when nothing is known", () => {
    expect(getDirectoryLastInteractedAt({ id: ORG_A, name: "X" }, {})).toBe("");
  });
});

describe("diffDirectoryPeople", () => {
  it("splits rows into insert / update / delete and ignores nameless rows", () => {
    const original = [{ id: CON_A, first_name: "Jane", last_name: "Vance" }, { id: ORG_B, first_name: "Gone", last_name: "Person" }];
    const rows = [
      { id: CON_A, first_name: "Jane", last_name: "Doe" }, // edited → update
      { first_name: "New", last_name: "Hire" }, // no id → insert
      { first_name: "  ", last_name: "" }, // blank → ignored
    ];
    const diff = diffDirectoryPeople(original, rows);
    expect(diff.toUpdate.map((r) => r.id)).toEqual([CON_A]);
    expect(diff.toInsert.map((r) => r.first_name)).toEqual(["New"]);
    expect(diff.toDeleteIds).toEqual([ORG_B]); // original person dropped from the rows
  });
  it("treats an existing row whose name was cleared as a delete", () => {
    const diff = diffDirectoryPeople([{ id: CON_A, first_name: "Jane" }], [{ id: CON_A, first_name: "", last_name: "" }]);
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.toDeleteIds).toEqual([CON_A]);
  });
});

describe("makeOrgDraftFromIndividual", () => {
  it("recombines the name and carries over contact info + tracker link", () => {
    const draft = makeOrgDraftFromIndividual(
      { first_name: "Animal Welfare", last_name: "Association", email: "g@awanj.org", grassroots_target_id: TGT_A, notes: "Organizer" },
      LOC,
    );
    expect(draft.isDraft).toBe(true);
    expect(draft.name).toBe("Animal Welfare Association");
    expect(draft.email).toBe("g@awanj.org");
    expect(draft.grassroots_target_id).toBe(TGT_A);
    expect(draft.notes).toBe("Organizer");
  });
});

describe("directory notes / updates feed", () => {
  it("builds a note payload parented to an org", () => {
    const payload = buildDirectoryNotePayload("  Called them  ", LOC, { userId: CON_A, name: "Zoe" }, { orgId: ORG_A });
    expect(payload).toMatchObject({ location_id: LOC, org_id: ORG_A, contact_id: null, body: "Called them", created_by_name: "Zoe" });
  });
  it("groups active notes by org, skipping deleted", () => {
    const grouped = groupDirectoryNotesByOrg([
      { id: "n1", org_id: ORG_A, body: "a" },
      { id: "n2", org_id: ORG_A, body: "b", deleted_at: "2026-01-01" },
      { id: "n3", org_id: ORG_B, body: "c" },
    ]);
    expect(grouped[ORG_A].map((n) => n.id)).toEqual(["n1"]);
    expect(grouped[ORG_B].map((n) => n.id)).toEqual(["n3"]);
  });
  it("merges an org's notes + history into one newest-first feed", () => {
    const org = { id: ORG_A };
    const notes = [
      { id: "n1", org_id: ORG_A, body: "Left a voicemail", created_at: "2026-05-05T10:00:00Z", created_by_name: "Zoe" },
      { id: "n2", org_id: ORG_B, body: "other org", created_at: "2026-05-09T10:00:00Z" },
    ];
    const history = [
      { id: "h1", entity_id: ORG_A, event_type: "created", event_at: "2026-05-01T10:00:00Z", changed_by_name: "Pat" },
      { id: "h2", entity_id: ORG_B, event_type: "updated", event_at: "2026-05-08T10:00:00Z" },
    ];
    const feed = buildDirectoryUpdatesFeed(org, { notes, history });
    expect(feed.map((f) => f.id)).toEqual(["note_n1", "evt_h1"]); // only ORG_A, newest first
    expect(feed[0]).toMatchObject({ kind: "note", text: "Left a voicemail", by: "Zoe" });
    expect(feed[1]).toMatchObject({ kind: "event", text: "Organization added" });
  });
});

describe("history helpers", () => {
  it("labels and colors events", () => {
    expect(getDirectoryHistoryEventLabel("created")).toBe("Added");
    expect(getDirectoryHistoryEventLabel("zzz")).toBe("Changed");
    expect(getDirectoryHistoryEventColor("deleted")).toBe("danger");
    expect(getDirectoryHistoryEventColor("updated")).toBe("info");
  });
  it("summarizes an entry into a sentence", () => {
    expect(summarizeDirectoryHistoryEntry({ changed_by_name: "Zoe", entity_type: "org", event_type: "created", entity_name: "Acme" }))
      .toBe("Zoe added organization “Acme”");
  });
  it("groups history newest-day first", () => {
    const history = [
      { id: "1", event_at: "2026-05-01T10:00:00Z", entity_name: "A" },
      { id: "2", event_at: "2026-05-02T09:00:00Z", entity_name: "B" },
      { id: "3", event_at: "2026-05-02T08:00:00Z", entity_name: "C" },
    ];
    const grouped = groupDirectoryHistoryByDay(history);
    expect(grouped.map((g) => g.day)).toEqual(["2026-05-02", "2026-05-01"]);
    expect(grouped[0].entries.map((e) => e.id)).toEqual(["2", "3"]);
  });
});
