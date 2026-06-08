// Capture REAL screenshots of the K9 Operations BASE (Lite/KOL) platform for the
// marketing site (src/LandingPage.jsx). Produces /public/shots/*.png which the
// AppFrame components reference via their `shot` prop.
//
// ⚠️  PII SAFETY: these screenshots go on a PUBLIC marketing site. ONLY run this
//     against a DEMO account/location whose data is SYNTHETIC or fully scrubbed.
//     Never publish screenshots of real client / employee / reservation data.
//
// Prereqs (run in a Cloud Agent VM that HAS the secrets injected):
//   - env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, DEMO_LOGIN_EMAIL, DEMO_LOGIN_PASSWORD
//   - deps: npm i playwright && npx playwright install chromium
//   - build + serve the app with the real env, then point BASE at it:
//       VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY npx vite build
//       npx vite preview --port 4173 &   (background)
//   - run: BASE=http://localhost:4173 node scripts/capture-marketing-shots.mjs
//
// The base app's nav is role-based and auto-discovered at runtime; this writes a
// nav-manifest.json so the exact base structure is captured (no guessing). Refine
// the SHOTS targets below after the first run reveals the real nav labels.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE || "http://localhost:4173";
const EMAIL = process.env.DEMO_LOGIN_EMAIL;
const PASS = process.env.DEMO_LOGIN_PASSWORD;
const OUT = "public/shots";

if (!EMAIL || !PASS) { console.error("Missing DEMO_LOGIN_EMAIL / DEMO_LOGIN_PASSWORD"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const logs = [];
page.on("pageerror", (e) => logs.push("PAGEERROR: " + (e.message || e)));

// 1) Log in
await page.goto(BASE + "/login", { waitUntil: "load", timeout: 30000 });
await page.fill('input[type="email"], input[name="email"]', EMAIL).catch(() => {});
await page.fill('input[type="password"], input[name="password"]', PASS).catch(() => {});
await Promise.all([
  page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {}),
  page.click('button[type="submit"], button:has-text("Sign In"), button:has-text("Sign in"), button:has-text("Log In")').catch(() => {}),
]);
await page.waitForTimeout(7000); // auth + base app first load
logs.push("post-login url: " + page.url());

// 2) Auto-discover the base (Lite/KOL) sidebar nav
const nav = await page.evaluate(() => {
  const items = [];
  document.querySelectorAll('a[href], button, [role="button"]').forEach((el) => {
    const text = (el.textContent || "").trim().replace(/\s+/g, " ");
    const href = el.getAttribute("href") || "";
    if (text && text.length > 0 && text.length < 28) items.push({ text, href });
  });
  return items;
});
writeFileSync(`${OUT}/nav-manifest.json`, JSON.stringify({ url: page.url(), nav }, null, 2));
logs.push(`nav candidates: ${nav.length}`);

// 3) Capture: home first, then click each nav label and shoot.
async function shoot(name) {
  await page.waitForTimeout(2500); // let data load + render
  await page.screenshot({ path: `${OUT}/${name}.png` });
  logs.push(`shot ${name} @ ${page.url()}`);
}

await shoot("home");

// Real base nav labels (refine from nav-manifest.json on first run). These are the
// base platform areas — NOT POS, analytics dashboards, or checkout TV.
const TARGETS = ["CRM", "Marketing", "Inventory", "Calendar", "Labor", "Enrichments",
  "Incidents", "Resort Upkeep", "Resources", "My Work", "Photos", "Settings"];

for (const label of TARGETS) {
  try {
    const link = page.getByRole("link", { name: label, exact: false }).first();
    if (await link.count()) {
      await link.click({ timeout: 5000 });
      await shoot(label.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
    } else {
      logs.push(`nav '${label}' not found — skipped`);
    }
  } catch (e) {
    logs.push(`nav '${label}' error: ${(e.message || e).slice(0, 80)}`);
  }
}

writeFileSync(`${OUT}/capture-log.txt`, logs.join("\n"));
console.log(logs.join("\n"));
await browser.close();
console.log("\nDONE → review public/shots/*.png (PII-check!) and public/shots/nav-manifest.json");
