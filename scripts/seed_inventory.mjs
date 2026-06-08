#!/usr/bin/env node
// Seed inventory_catalog from inventory_items.json via Supabase REST API
import { readFileSync } from "fs";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOCATION_ID = process.env.LOCATION_ID || "";

if (!SUPABASE_KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is required to seed inventory_catalog.");
  process.exit(1);
}

import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
// Try local workspace path first, then repo-relative path
let jsonPath;
try {
  jsonPath = resolve(__dirname, "../inventory_items.json");
  readFileSync(jsonPath);
} catch {
  jsonPath = "/home/user/workspace/inventory_items.json";
}
const raw = JSON.parse(readFileSync(jsonPath, "utf-8"));

const rows = raw.map((item, i) => ({
  location_id: LOCATION_ID,
  item_name: item.item,
  size: item.size || null,
  vendor: item.vendor || null,
  category: item.category || null,
  subcategory: item.subcategory || null,
  gl_account: item.gl_account || null,
  par_level: item.par_level ?? 0,
  min_reorder: null,
  unit_price: item.unit_price ?? 0,
  vendor_link: item.link || null,
  is_active: true,
  sort_order: i,
}));

console.log(`Seeding ${rows.length} items into inventory_catalog...`);

// Supabase REST API accepts bulk inserts
const res = await fetch(`${SUPABASE_URL}/rest/v1/inventory_catalog`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Prefer": "return=minimal",
  },
  body: JSON.stringify(rows),
});

if (res.ok) {
  console.log(`Success! ${rows.length} items inserted.`);
} else {
  const text = await res.text();
  console.error(`Error ${res.status}: ${text}`);
  process.exit(1);
}
