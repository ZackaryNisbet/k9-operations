import fixture from "../src/__tests__/fixtures/cherryHillRoomCleaning2026-04-15.json" with { type: "json" };
import {
  execSqlSelect,
  parseArgs,
  resolveProjectRef,
} from "./_supabaseOps.mjs";

const BUCKET_LABELS = {
  room_refresh: "Room Refresh",
  full_disinfect: "Full Disinfect",
  setup: "Set Up",
  sanitize_and_setup: "Sanitize + Set Up",
  full_disinfect_then_setup: "Full Disinfect + Set Up",
  full_disinfect_then_setup_and_sanitize: "Full Disinfect + Set Up + Sanitize",
};

function labelForBucket(bucket) {
  if (!bucket) return "-";
  return BUCKET_LABELS[bucket] || bucket;
}

function extractRoomCode(label) {
  const source = String(label || "").trim().toUpperCase();
  if (!source) return null;

  const letterRoom = source.match(/\b([1-8][ABC])\b/);
  if (letterRoom) return letterRoom[1];

  const wingRoom = source.match(/\b(LER|SER)\s*0*([1-9]|10)\b/);
  if (wingRoom) return `${wingRoom[1]}${wingRoom[2]}`;

  const numericRoom = source.match(/\b([1-9][0-9]{2})\b/);
  if (numericRoom) return numericRoom[1];

  return null;
}

function labelFromLegacyRoom(room) {
  if (room?.needsDisinfect && room?.needsSetup && room?.needsSanitize) {
    return "Full Disinfect + Set Up + Sanitize";
  }
  if (room?.needsDisinfect && room?.needsSetup) {
    return "Full Disinfect + Set Up";
  }
  if (room?.needsRefresh) return "Room Refresh";
  if (room?.needsDisinfect) return "Full Disinfect";
  if (room?.needsSetup && room?.needsSanitize) return "Sanitize + Set Up";
  if (room?.needsSetup) return "Set Up";
  return "-";
}

function buildDisplayMap(payload) {
  const map = {};
  const classifications = payload?.room_classifications || [];

  if (classifications.length > 0) {
    for (const classification of classifications) {
      if (!classification?.room_code) continue;
      map[String(classification.room_code)] = labelForBucket(classification.classification_bucket);
    }
    return map;
  }

  for (const room of payload?.rooms || []) {
    const roomCode = extractRoomCode(room?.room || room?.roomCode);
    if (!roomCode) continue;
    map[String(roomCode)] = labelFromLegacyRoom(room);
  }
  return map;
}

const args = parseArgs(process.argv.slice(2));
const projectRef = resolveProjectRef(args);
const locationSlug = String(args.location || fixture.locationSlug).trim();
const targetDate = String(args.date || fixture.date).trim();

const locations = await execSqlSelect(
  projectRef,
  "select id, slug from locations where slug = $1 limit 1",
  [locationSlug],
);

if (!locations.length) {
  throw new Error(`No location found for slug ${locationSlug}`);
}

const locationId = String(locations[0].id);
const rows = await execSqlSelect(
  projectRef,
  `select computed_items
     from lite_daily_ops
    where location_id::text = $1
      and type = 'room_cleaning'
      and type_sub = 'room_cleaning'
      and date::text = $2
    order by computed_at desc
    limit 1`,
  [locationId, targetDate],
);

if (!rows.length || !rows[0].computed_items) {
  throw new Error(`No room cleaning payload found for ${locationSlug} on ${targetDate}`);
}

const payload = rows[0].computed_items.room_cleaning || rows[0].computed_items;
const liveMap = buildDisplayMap(payload);
const expectedMap = Object.fromEntries(
  Object.entries(fixture.rooms).map(([roomCode, roomFixture]) => [roomCode, roomFixture.type]),
);

const allRoomCodes = [...new Set([...Object.keys(expectedMap), ...Object.keys(liveMap)])].sort((a, b) =>
  a.localeCompare(b, undefined, { numeric: true }),
);

const mismatches = allRoomCodes
  .map((roomCode) => ({
    room: roomCode,
    expected: expectedMap[roomCode] || "(missing from fixture)",
    actual: liveMap[roomCode] || "(missing from live payload)",
  }))
  .filter((entry) => entry.expected !== entry.actual);

const actualCounts = {};
for (const label of Object.values(liveMap)) {
  actualCounts[label] = (actualCounts[label] || 0) + 1;
}

const report = {
  projectRef,
  locationSlug,
  locationId,
  targetDate,
  expectedSummary: fixture.summary,
  actualSummary: actualCounts,
  roomMismatchCount: mismatches.length,
  mismatches,
};

console.log(JSON.stringify(report, null, 2));
