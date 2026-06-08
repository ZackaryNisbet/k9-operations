// Capture REAL screenshots of the K9 Operations BASE (Lite/KOL) platform for the
// marketing site (src/LandingPage.jsx). Produces /public/shots/*.png which the
// AppFrame components reference via their `shot` prop.
//
// ⚠️  PII SAFETY: these screenshots go on a PUBLIC marketing site. ONLY run this
//     against a DEMO account/location whose data is SYNTHETIC or fully scrubbed,
//     and ALWAYS review every shot before publishing. Never publish screenshots of
//     real client / employee / reservation data. The wiring step in LandingPage.jsx
//     only references shots that were reviewed and confirmed PII-free (aggregate
//     dashboards, the demand/staffing matrix, inventory, resources, etc.).
//
// Prereqs (run in a Cloud Agent VM that HAS the secrets injected):
//   - env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, DEMO_LOGIN_EMAIL, DEMO_LOGIN_PASSWORD
//   - deps: npm i playwright && npx playwright install chromium
//   - build + serve the app with the real env, then point BASE at it:
//       VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY npx vite build
//       npx vite preview --port 4173 &   (background)
//   - run: BASE=http://localhost:4173 node scripts/capture-marketing-shots.mjs
//
// The base app's sidebar nav is role-based and rendered as <button>s (no hrefs),
// but every page is a deep-linkable URL (/{location}/{page}). We log in once, then
// navigate by URL so the capture is deterministic and the sidebar sits in its calm
// collapsed state. A nav-manifest.json records the discovered rail for reference.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE || "http://localhost:4173";
const EMAIL = process.env.DEMO_LOGIN_EMAIL;
const PASS = process.env.DEMO_LOGIN_PASSWORD;
const OUT = "public/shots";

// Base-platform pages to capture, keyed by the slug segment after /{location}/.
// Names become public/shots/<name>.png and are referenced by AppFrame `shot` props
// in src/LandingPage.jsx. These are base-platform areas only — no POS surfaces.
//
// This list is intentionally limited to pages that were reviewed and confirmed to
// contain ONLY aggregate / non-personal data, so the captures are safe to publish
// on the public marketing site:
const SHOTS = [
  { name: "home", path: "home" },                  // role-aware overview: aggregate KPIs + launcher
  { name: "operations", path: "operations" },      // ops overview: checklist progress (counts only)
  { name: "scheduling", path: "scheduling" },      // 7-day demand vs. staffing matrix (numbers only)
  { name: "occupancy", path: "occupancy-report" }, // occupancy % trend (no revenue, no names)
];

// Reviewed but DELIBERATELY EXCLUDED — these base pages render real personal or
// business-sensitive data on the production location and must NOT be published.
// Re-enable individually only when pointed at a synthetic/scrubbed demo location,
// and re-review the output before wiring it into LandingPage.jsx:
//   { name: "crm", path: "crm" },               // ✗ real client names + phone numbers
//   { name: "checkout-tv", path: "checkout-tv" }, // ✗ real pet photos + owner surnames
//   { name: "labor", path: "labor" },           // ✗ real employee roster: names, phones, emails
//   { name: "enrichments", path: "enrichments" }, // ✗ real pet + owner names / photos
//   { name: "calendar", path: "calendar" },     // ✗ named employee reviews + reservations
//   { name: "marketing", path: "grassroots" },  // ✗ named third-party partner orgs + costs
//   { name: "reports", path: "reports" },       // ✗ real business revenue figures (analytics dashboard)

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
const postLogin = page.url();
logs.push("post-login url: " + postLogin);

// Derive the location slug from the post-login URL (e.g. /cherry-hill/home).
const slugMatch = new URL(postLogin).pathname.split("/").filter(Boolean);
const locSlug = slugMatch[0] || "cherry-hill";
logs.push("location slug: " + locSlug);

// 2) Record the discovered base sidebar nav for reference
const nav = await page.evaluate(() => {
  const items = [];
  document.querySelectorAll('nav button, a[href], [role="button"]').forEach((el) => {
    const text = (el.textContent || "").trim().replace(/\s+/g, " ");
    const href = el.getAttribute("href") || "";
    if (text && text.length > 0 && text.length < 28) items.push({ text, href });
  });
  return items;
});
writeFileSync(`${OUT}/nav-manifest.json`, JSON.stringify({ url: postLogin, locSlug, nav }, null, 2));
logs.push(`nav candidates: ${nav.length}`);

// 3) Capture each target by URL. Move the pointer into the content area first so the
//    hover-expanding sidebar stays collapsed and out of the way.
async function shoot(name, path) {
  const url = `${BASE}/${locSlug}/${path}`;
  try {
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.mouse.move(1100, 450);
    await page.waitForTimeout(3500); // let Supabase data load + render
    await page.mouse.move(1150, 480);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    logs.push(`shot ${name} @ ${page.url()}`);
  } catch (e) {
    logs.push(`shot ${name} FAILED: ${(e.message || e).slice(0, 120)}`);
  }
}

for (const s of SHOTS) {
  await shoot(s.name, s.path);
}

writeFileSync(`${OUT}/capture-log.txt`, logs.join("\n"));
console.log(logs.join("\n"));
await browser.close();
console.log("\nDONE → review public/shots/*.png (PII-check!) and public/shots/nav-manifest.json");
