const DEFAULT_PRICE_CENTS = 1500;

export const ENRICHMENT_AUDIENCES = [
  { id: "staff", label: "Staff Calendar" },
  { id: "customer", label: "Customer Graphic" },
  { id: "all", label: "All Events" },
];

export const ENRICHMENT_FOCUS_LABELS = {
  brainwork: "Sniffing / Brainwork",
  movement: "Movement",
  dress_up: "Dress Up",
  water: "Water Play",
  client: "Client Experience",
  holiday: "Holiday",
  spa: "Spa",
};

export const ENRICHMENT_VISUAL_THEMES = [
  { id: "spring", label: "Spring", color: "#EC4899", accent: "#84CC16", soft: "#FCE7F3" },
  { id: "fiesta", label: "Fiesta", color: "#D97706", accent: "#84CC16", soft: "#FFFBEB" },
  { id: "prom", label: "Prom", color: "#DC2626", accent: "#F59E0B", soft: "#FEE2E2" },
  { id: "summer", label: "Summer", color: "#3B82F6", accent: "#F59E0B", soft: "#EFF6FF" },
  { id: "bee", label: "Busy Bee", color: "#D97706", accent: "#0F172A", soft: "#FFFBEB" },
  { id: "camp", label: "Camp", color: "#14532D", accent: "#F59E0B", soft: "#ECFDF5" },
  { id: "luau", label: "Luau", color: "#16A34A", accent: "#EC4899", soft: "#DCFCE7" },
  { id: "patriotic", label: "Patriotic", color: "#2563EB", accent: "#DC2626", soft: "#DBEAFE" },
  { id: "neutral", label: "Clean K9", color: "#14532D", accent: "#84CC16", soft: "#ECFDF5" },
];

export const DEFAULT_ENRICHMENT_NOTES = [
  "Enrichment is a $15 add-on session unless otherwise noted.",
  "Each dog completes one enrichment lesson per purchased service.",
  "Lessons rotate daily and themed calendar events can be scheduled from the same portal.",
];

export const DEFAULT_ENRICHMENT_GUIDELINES = [
  "Make sure photos are clear of background mess, dogs look forward, and dogs do not look stressed or uncomfortable.",
  "Use treats or squeaky toys to get attention. If a still photo is not possible, take video and pull the best frame.",
  "Remove daycare or boarding collars when possible so pictures and videos look cleaner.",
  "Events can be facilitated in a private play yard, daycare yard, or luxury suite.",
  "Focus programming across three groups: sniffing and brainwork, movement, and dress-up activities.",
  "Use linked products as references, but adapt each event to the resort, available space, weather, and dog temperament.",
  "Use patterned tablecloths for clean floors or quick backdrops. Dollar store decorations are encouraged when they look polished.",
  "Put a sign-up sheet out before the event to create parent interest and give CSRs a clean talking point.",
];

function p(name, url, quantity = "") {
  return { name, quantity, url, status: "reference" };
}

const LESSON_PRODUCT_LINKS = {
  treatPuzzles: "https://www.amazon.com/Ottosson-Outward-Hound-Purple-Interactive/dp/B082748C86/ref=sr_1_10?dib=eyJ2IjoiMSJ9.6Ko08AgcPk3RsXXL_8XqLsWds2CLBhDZQDShiOS1tBt-xf7-QlKzV24bdHAAGxYK2rwSI5_bL3CGZsooIkVNbybkMgC9VXE2YNp7Jh0Jugc43ml7YKSxrrptpNSIqsJ5A25JfEiH2OibkOdtT2BlmDxgK_Q90M_1pQsdbLxmWcADCy9qTieLZQHXebG45mIZgrPNmc7fgFfjcfV7u_oa1GJ955sXzF_X9oOJi_SoY3c.pn5b5tiwEUBeSrMg9akMzqPmkoxF5mPHIt2HebMvP-Y&dib_tag=se&keywords=dog%2Bpuzzle&qid=1773261442&sr=8-10&th=1",
  buttonBell: "https://www.amazon.com/dp/B07G5951YF?ref=fed_asin_title&th=1",
  hangingBellCluster: "https://www.amazon.com/dp/B097BQYZC5?ref=fed_asin_title&th=1",
  singleBellRope: "https://www.amazon.com/dp/B00R6RHH7O?ref=fed_asin_title",
  lickMats: "https://www.amazon.com/dp/B091Q1GDJX?ref=fed_asin_title&th=1",
  plasticKiddiePool: "https://www.amazon.com/Dog-Pool-Foldable-High-Strength-Collapsible/dp/B0DPKNBSGR/ref=sr_1_14?crid=1903NMS6K6RLV&dib=eyJ2IjoiMSJ9.CxlcdCV5lYOQuuz_uxhYkGI1SrtdR_5GoOKX62b9wtgC-Vj_c8sn30yMR1GgDnHK5j4L_HWymYOb-y8fXY8sFZIEcTKiWMuI80opWuVMjobZw3vPfY6QZfqXVGoKshWTc97rVAe-xQ0-Zp2pUMK7KDToWPhxPPYiInzbHlb1J5hKwGFtJA1zmugynCFyyt4Bp0zE3jGRpvKm7Txe3M2yLa4c9byuRyeNPhpHE19juV0.95gue2SDgvKvB1tiPcIEjwot7i1oC8d2EudWwTAWWu8&dib_tag=se&keywords=kiddie%2Bpool&qid=1773261495&sprefix=kiddie%2Bpool%2Caps%2C205&sr=8-14&th=1",
  ballPitBalls: "https://www.amazon.com/dp/B0DXDPWZW1?ref=fed_asin_title&th=1",
  muffinTins: "https://www.amazon.com/dp/B073P4RPFP?ref=fed_asin_title&th=1",
  tennisBalls: "https://www.amazon.com/dp/B0BH8YGJYF?ref=fed_asin_title&th=1",
  scentBags: "https://www.amazon.com/dp/B0FHBKTH7B?ref=fed_asin_title&th=1",
  pupsicleBall: "https://www.amazon.com/WOOF-Pupsicle-Long-Lasting-Distracted-Fillable/dp/B0C15QKM3X/ref=sr_1_3?crid=1547JIAXLVFX5&dib=eyJ2IjoiMSJ9.MQ1yBSoo_SSd6PosaFh30JbYs0ghpi8S29lUtjnxIDAxEQjbYhrkO4f4tVsgP1DL3aQz_VLFsD6DDshDa1etc3SExaBdZjj6-Dlfv1z5hPvUKOYumKO-LmPBoqn5SX_ia7290W1YuGn6lAsergrIfEdQNq5ZZUDRYdbNA8feKkhyYgy6AdFFEpruM-3fXqD2jnP2ReGCZDqcSqFjcNCuEEdyzht_K1lDVki2Tzswv3k.q1YSosYIjisuGLSeKZdR9IXyHK__4kW02-9nmiVqK5A&dib_tag=se&keywords=popsicle%2Bball&qid=1766807996&rdc=1&sprefix=popsicle%2Bball%2Caps%2C149&sr=8-3&th=1",
  pupsicleMold: "https://www.amazon.com/BABORUI-Cavities-Silicone-Pupsicle-Reusable/dp/B0C8SYH896/ref=sr_1_1_sspa?adgrpid=190247108390&dib=eyJ2IjoiMSJ9.oCGIafGuqEbYEvAZnTyuiEeS0bvkkzdvU8zI1mBhph_Ut0By1-_GNJTmSO-38uRWgnTy4Gb6-Jofadz3-vtmVfsWJToKYS9Xzjt_OYftGEUMw-UDtbq8q_LR9ljjnwMDIYlA4OijRae2jOA_H-8HrqTB6iyMQ147uCNAbDAayBsKcyy_6brCC6yXCiF-Eum-YhI_dPtoSE6Tm5iza-AM1iAU0MlwjpfjaDB4_OthxME.ZUfZWyQmDy0R1PbvcNlOsAvQZhb_geg4zi24uTIktbw&dib_tag=se&hvadid=792800094428&hvdev=c&hvexpln=0&hvlocphy=9021908&hvnetw=g&hvocijid=1082298242304213616--&hvqmt=b&hvrand=1082298242304213616&hvtargid=kwd-1965985542451&hydadcr=7498_13576625_2362876&keywords=pupsicle%2Btreat%2Bmold&mcid=d21daf21135d30ff8e1c25b94f0cb043&qid=1768617228&sr=8-1-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1",
  snuffleMat: "https://www.amazon.com/dp/B0BPFVXBYC?ref=fed_asin_title&th=1",
  textureMats: "https://www.amazon.com/dp/B0CR191K5R?ref=fed_asin_title&th=1",
  agilityConesPoles: "https://www.amazon.com/dp/B0FF91ZXDQ?ref=fed_asin_title&th=1",
};

export const ENRICHMENT_RESOURCE_LINKS = [
  { label: "Round 2 Enrichment Lessons", url: "https://drive.google.com/open?id=1_XwZ4ME24uJ1bs07QcUhrGgNKuXAQtWo" },
  { label: "Round 1 Enrichment Lessons", url: "https://drive.google.com/open?id=1H5dSqXHSudnDM2a9JPECt5NWTvr1l6YD" },
  { label: "Round 1 Enrichment Calendar", url: "https://drive.google.com/file/d/1AvMJqO_uOs1upWGe1Fpz89iDMWR-qtBR/view?usp=share_link" },
  { label: "Enrichment Round 2 Flyers", url: "https://drive.google.com/file/d/1qSubrBMDKOK4T52__HykANvj4RmxhCi3/view?usp=share_link" },
];

export const ENRICHMENT_PROGRAM_CONFIG_SETTING_KEY = "enrichment_program_config_v1";

export const ENRICHMENT_PROGRAM_SOP_SECTIONS = [
  {
    title: "Program Rules",
    items: [
      "Program type: mental enrichment add-on.",
      "Price: $15 per session.",
      "Eligible dogs: daycare, private playtime, and boarding.",
      "Not available as a standalone service.",
      "Each dog completes one lesson only per service.",
      "Staff rotate through five different lessons per month.",
    ],
  },
  {
    title: "Program Purpose",
    items: [
      "Provide mental stimulation and engagement alongside regular daycare, private playtime, or boarding routines.",
      "Focus on mental enrichment, not training outcomes.",
      "Enhance the guest experience, support mental wellness, and add value without pressure.",
    ],
  },
  {
    title: "What This Is",
    items: [
      "A one-time enrichment experience per service.",
      "A structured mental activity.",
      "Calm, choice-based engagement.",
      "Adaptable for dogs of all ages, breeds, and energy levels.",
    ],
  },
  {
    title: "What This Is Not",
    items: [
      "Not training.",
      "Not obedience instruction.",
      "Not behavior modification.",
      "No skill guarantees.",
      "Staff should never promise learned behaviors or outcomes.",
    ],
  },
  {
    title: "Session Guidelines",
    items: [
      "Duration: 5-15 minutes depending on lesson.",
      "Environment: quiet enclosed space, private play yard, or luxury suite.",
      "Format: one dog at a time unless daycare-approved dogs are sharing safe supplies.",
      "Approach: calm, low-pressure, choice-based.",
      "Private playtime dogs must use washed supplies between uses.",
      "End early if the dog disengages, becomes overstimulated, shows stress signals, or shows guarding issues.",
    ],
  },
  {
    title: "Staff Responsibilities",
    items: [
      "Follow the assigned lesson plan exactly.",
      "Use enrichment language only.",
      "Do not cue or coach behaviors.",
      "Do not repeat commands.",
      "Do not force participation.",
      "Engagement is optional; ending early is still a successful session.",
    ],
  },
  {
    title: "Booking and Billing",
    items: [
      "Add-on only.",
      "$15 flat fee.",
      "Added at check-in or during booking.",
      "One enrichment session per service.",
    ],
  },
];

function cloneResourceLinks(links = ENRICHMENT_RESOURCE_LINKS) {
  return links.map((link) => ({ label: link.label, url: link.url }));
}

function cloneSopSections(sections = ENRICHMENT_PROGRAM_SOP_SECTIONS) {
  return sections.map((section) => ({
    title: section.title,
    items: [...(section.items || [])],
  }));
}

function normalizeLinkUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (/^(www\.)?[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(url)) return `https://${url}`;
  return url;
}

export function normalizeEnrichmentProgramResourceLinks(links) {
  const source = Array.isArray(links) ? links : ENRICHMENT_RESOURCE_LINKS;
  return source
    .map((link) => ({
      label: String(link?.label || "").trim(),
      url: normalizeLinkUrl(link?.url),
    }))
    .filter((link) => link.label && link.url);
}

export function normalizeEnrichmentProgramSopSections(sections) {
  const source = Array.isArray(sections) ? sections : ENRICHMENT_PROGRAM_SOP_SECTIONS;
  return source
    .map((section) => {
      const items = (Array.isArray(section?.items) ? section.items : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean);
      const title = String(section?.title || "").trim() || (items.length ? "Untitled Section" : "");
      return { title, items };
    })
    .filter((section) => section.title || section.items.length);
}

export function normalizeEnrichmentProgramConfig(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    resourceLinks: normalizeEnrichmentProgramResourceLinks(
      Array.isArray(source.resourceLinks) ? source.resourceLinks : cloneResourceLinks()
    ),
    programSopSections: normalizeEnrichmentProgramSopSections(
      Array.isArray(source.programSopSections) ? source.programSopSections : cloneSopSections()
    ),
    updatedAt: source.updatedAt || source.updated_at || null,
    updatedBy: source.updatedBy || source.updated_by || "",
  };
}

export function prepareEnrichmentProgramConfigPayload(config, actorName = "") {
  const normalized = normalizeEnrichmentProgramConfig(config);
  return {
    ...normalized,
    updatedAt: new Date().toISOString(),
    updatedBy: String(actorName || "").trim() || "Enterprise Admin",
  };
}

export const ENRICHMENT_CSR_GUIDE_SECTIONS = [
  {
    title: "What to Say It Is",
    items: [
      "Mental enrichment.",
      "Brain workout.",
      "Mental stimulation.",
      "One-on-one activity.",
      "A quick structured session that gives dogs a brain workout using sniffing, foraging, and problem-solving activities.",
    ],
  },
  {
    title: "Words to Avoid",
    items: [
      "Training.",
      "Commands.",
      "Obedience.",
      "Skill-building.",
      "Behavior correction.",
      "Behavior promises.",
    ],
  },
  {
    title: "When to Offer It",
    items: [
      "At daycare check-in.",
      "During boarding reservation calls.",
      "At boarding check-in.",
      "When a client mentions high energy, winter boredom, or mental stimulation.",
      "Offer confidently, but do not push if the client declines.",
    ],
  },
  {
    title: "Why Clients Say Yes",
    items: [
      "Helps dogs feel calmer and more fulfilled.",
      "Good for high-energy or anxious dogs.",
      "Adds value beyond physical play.",
      "Dogs of all ages and sizes can participate.",
    ],
  },
  {
    title: "Easy to Sell Because",
    items: [
      "Can be added to any reservation type.",
      "One-on-one attention for the dog.",
      "Rotating activities every day.",
      "No large package or purchase commitment.",
    ],
  },
  {
    title: "CSR Reminders",
    items: [
      "Do not over-explain. Simple sells better.",
      "SMS should be the last resort; pitch enrichment in person whenever possible.",
      "Always take photos and send to the customer if able.",
      "Position the activity as beneficial for the dog's health because it is.",
      "This can be used as a conversion tool and a customer-experience enhancement.",
      "Try offering one session for free if clients are on the fence so they can see the benefits for the future.",
    ],
  },
];

export const ENRICHMENT_TEXT_SCRIPTS = [
  {
    label: "Initial Outreach",
    text: "Hi! This is __ with K9 Resorts. Did you want to add an enrichment activity to Fluffy's reservation today? It's a fun brain workout that pairs well with physical play for $15.",
  },
  {
    label: "If Asked What It Is",
    text: "Enrichment activities are fun, one-on-one brain games that involve sniffing, games and puzzles. It's mental stimulation that lasts about 10-15 minutes to wear them out.",
  },
  {
    label: "If They Say Yes",
    text: "Perfect! We will add that for Fluffy today. I know he/she is going to love it. All the pups really enjoy today's activity.",
  },
  {
    label: "If They Say No",
    text: "That is totally fine. Just let us know anytime you want to add it in the future. We offer it every day.",
  },
  {
    label: "Daycare Verbal Script",
    text: "We offer enrichment as an add-on if you would like to give your dog a mental workout in addition to playtime. It is $15 and includes a themed activity designed to keep their brain engaged.",
  },
  {
    label: "Boarding Verbal Script",
    text: "We also offer enrichment as a daily add-on during boarding. It is $15 per day and gives your dog a structured mental activity in addition to their regular routine.",
  },
  {
    label: "What Is Enrichment",
    text: "Enrichment is a structured activity designed to work your dog's brain, like puzzles, scent work, or calm problem-solving activities. It complements physical play really well.",
  },
  {
    label: "Client Hesitant",
    text: "Totally optional. It is just there if you would like to add something extra beyond standard play or boarding.",
  },
];

const SOP_EVENTS = {
  cinco: {
    title: "Cinco de Mayo Fiesta",
    focus: "dress_up",
    theme: "fiesta",
    summary: "Cinco de Mayo themed party with themed outfits, headbands, backdrop photos, pup cups, bubbles, lights, and added decor.",
    staff_notes: "Keep costumes light and size-appropriate. Use bubbles for motion in photos, but avoid crowding nervous dogs.",
    setup_locations: ["Private play yard", "Daycare yard", "Luxury suite"],
    products: [
      p("Banner or paper decorations", "https://www.amazon.com/Decorations-Banner-Include-Hanging-Mexican/dp/B0GKRD4XDQ"),
      p("Backdrop", "https://www.amazon.com/Swepuck-72x43inch-Photography-Background-Decorations/dp/B0GS4Z7624"),
      p("Hats", "https://www.amazon.com/JOYIN-Sombrero-Headbands-Supplies-Decorations/dp/B08WZ7W63X"),
      p("Decorations", "https://www.amazon.com/Decorations-Curtains-Themed-3-3x6-6ft-Streamers/dp/B0CLRB94BZ"),
      p("Costumes", "https://www.amazon.com/JaGely-Mexican-Accessories-Sombrero-Triangle/dp/B0CX92GHCL"),
      "Pup cups",
      "Bubbles",
    ],
    checklist: ["Set backdrop and floor cover", "Stage hats and costumes by dog size", "Prepare pup cups", "Start bubbles before photos", "Capture clean forward-facing photos", "Reset area between dogs"],
  },
  prom: {
    title: "Pup Prom",
    focus: "dress_up",
    theme: "prom",
    summary: "Prom attire photos with a red carpet walk, prom king and queen selections, and printed take-home photos when possible.",
    staff_notes: "Buy costumes that fit small, medium, and large dogs. Keep the red-carpet path clear and low-stress.",
    setup_locations: ["Luxury suite", "Lobby photo area", "Private play yard"],
    products: [
      p("Backdrop set", "https://www.amazon.com/Photography-Backdrop-Paparazzi-Accessory-Decorations/dp/B09R9XC23V"),
      p("Red carpet backdrop", "https://www.amazon.com/Christmas-Photography-Background-Decorations-Photoshoot/dp/B0CLRVSLLC"),
      p("Suit costumes", "https://www.amazon.com/Kuoser-Bandana-Wedding-Retriever-Bulldogs/dp/B089PTKW5V"),
      p("Tutu and tiara", "https://www.amazon.com/Headband-Crystal-Rhinestone-Costume-Birthday/dp/B0C7TLD3FN"),
      p("Small dress", "https://www.amazon.com/UOSIA-Beautiful-Breathable-Princess-Birthday%EF%BC%88Pink/dp/B0CRP7B4QW"),
      p("Sashes", "https://www.amazon.com/Lyrow-Graduation-Accessories-Bachelorette-Supplies/dp/B0CP8NFRCQ"),
      "Photo printer paper",
    ],
    checklist: ["Lay red carpet", "Stage backdrop", "Organize attire by size", "Choose prom king and queen", "Print or save parent-ready photos", "Log any dog who declined attire"],
  },
  bbq: {
    title: "Bark & BBQ Bash",
    focus: "movement",
    theme: "summer",
    summary: "Memorial Day themed activity with beach attire, red-white-blue decor, and a mini agility course using existing equipment.",
    staff_notes: "Pick one to two agility items from prior activities so setup stays fast and safe.",
    setup_locations: ["Outdoor daycare yard", "Private play yard"],
    products: [
      p("Cones", "https://www.amazon.com/FGBNM-Training-Football-Basketball-Equipment/dp/B0CPLCVK6N"),
      p("Paper decorations", "https://www.amazon.com/Memorial-Decorations-Remember-Patriotic-Supplies/dp/B0GKGJ6Z8S"),
      p("Flower costume", "https://www.amazon.com/gp/product/B0G435LQ1S"),
      p("Agility equipment", "https://www.amazon.com/Lupar-Adjustable-Rehabilitation-Beginners-Equipment/dp/B0FF8YV942"),
      p("Gold stars", "https://www.amazon.com/gp/product/B083981RBY"),
      p("Blue stars", "https://www.amazon.com/gp/product/B0CMJ48VQH"),
      p("Bandanas", "https://www.amazon.com/Preboun-Patriotic-Bandanas-Triangle-Accessories/dp/B0DYP4ZPQV"),
    ],
    checklist: ["Set mini agility route", "Check footing and heat", "Stage patriotic decor", "Dress dogs only if comfortable", "Record action clips", "Send winners or standout photos to parents"],
  },
  bee: {
    title: "Busy Bee Brain Games",
    focus: "brainwork",
    theme: "bee",
    summary: "Spring and summer brain game activity using snuffle mats, puzzles, hidden treats, and bee-themed photo decor.",
    staff_notes: "Use different puzzle difficulty by dog. Avoid frustrating dogs who are new to puzzle feeders.",
    setup_locations: ["Indoor daycare room", "Luxury suite"],
    products: [
      p("Treat puzzles", "https://www.amazon.com/FOXMM-Interactive-Training-Stimulating-Enrichment/dp/B09Y5V3PQV"),
      p("Snuffle mats", "https://www.amazon.com/Femont-Silicone-Encourages-Foraging-Interactive/dp/B0BWR1CXFF"),
      p("Butterfly decorations", "https://www.amazon.com/Zilue-Butterfly-Decorative-Garland-Birthday/dp/B07BRVMH3S"),
      p("Backdrop", "https://www.amazon.com/LYCGS-Background-Photography-Childrens-X-211/dp/B0CSK7MLJ7"),
      p("Bee costume", "https://www.amazon.com/Wodison-Headband-Accessories-Halloween-Christmas/dp/B0DDNL2SYP"),
      "High-value treats",
    ],
    checklist: ["Sanitize puzzle toys", "Portion treats", "Set easy and hard puzzle lanes", "Photograph focused sniffing work", "Clean mats after use", "Note dogs who need easier puzzles"],
  },
  camp: {
    title: "Camp Canine",
    focus: "client",
    theme: "camp",
    summary: "Camping themed painting event where dogs paint their own bandanas using sealed bags and dog-safe spread.",
    staff_notes: "Use fabric paint outside the sealed bag only. Keep dog-safe food inside the bag as the motivator.",
    setup_locations: ["Indoor daycare room", "Private play yard"],
    products: [
      p("Fabric paint", "https://www.amazon.com/Shuttle-Art-Permanent-Stencils-Non-Toxic/dp/B0D2VJWD48"),
      p("Fabric paint set", "https://www.amazon.com/AUREUO-Fabric-Paint-Set-Permanent/dp/B0G6CGDQTY"),
      p("Camping backdrop", "https://www.amazon.com/Roetyce-Decorations-Backdrop-Gatherings-Background/dp/B0BRS2HPWJ"),
      p("Paper decorations", "https://www.amazon.com/CCINEE-Decorations-Pre-Strung-Campsite-Adventure/dp/B0GJ5N6Q2Z"),
      p("Bandanas", "https://www.amazon.com/dp/B0B7JC1JXW"),
      "Zip bags",
      "Whipped cream or peanut butter",
    ],
    checklist: ["Pre-label bandanas", "Add paint safely", "Seal bags completely", "Let dogs lick outside of bag", "Dry finished bandanas", "Package take-home bandanas"],
  },
  luau: {
    title: "Luau Pawty Palooza",
    focus: "dress_up",
    theme: "luau",
    summary: "Hawaiian tiki themed party with outfits, headbands, backdrop photos, pup cups, bubbles, lights, and added decor.",
    staff_notes: "Keep loose leis and headbands supervised. Remove anything a dog tries to chew.",
    setup_locations: ["Private play yard", "Daycare yard", "Luxury suite"],
    products: [
      p("Luau costumes", "https://www.amazon.com/Halloween-Hawaiian-Sunglasses-Costumes-Supplies/dp/B09YM2PWDP"),
      p("Tropical shirts", "https://www.amazon.com/Colorful-T-Shirts-Breathable-Clothes-3X-Large/dp/B0D2NY4CPJ"),
      p("Backdrop", "https://www.amazon.com/Decorations-Hawaiian-Backdrop-Photography-Background/dp/B09YRNFHV1"),
      p("Paper decorations", "https://www.amazon.com/Hawaiian-Decorations-Decoration-Streamers-Tropical/dp/B0GHYKFM92"),
      "Pup cups",
      "Bubbles",
      "Lights",
    ],
    checklist: ["Build tiki backdrop", "Stage outfits by size", "Prepare pup cups", "Run bubbles for movement", "Capture clean photos", "Remove any chewable decor after each dog"],
  },
  relay: {
    title: "Beat the Heat Relay",
    focus: "movement",
    theme: "summer",
    summary: "Full agility-course activity using existing and new equipment, optional timed competition, and medals for dogs.",
    staff_notes: "Watch heat index. Keep sessions short, water available, and competition optional.",
    setup_locations: ["Outdoor daycare yard", "Private play yard"],
    products: [
      p("Decorations", "https://www.amazon.com/Racing-Cars-Birthday-Decorations-Centerpiece/dp/B0DJCG77N3"),
      p("Agility course equipment", "https://www.amazon.com/AHAILUOO-Equipment-Adjustable-independent-packaging/dp/B0CSFSY6K9"),
      p("Bandanas", "https://www.amazon.com/JarThenaAMCS-Checkered-Adjustable-Neckerchief-Accessories/dp/B0D8PKJPFQ"),
      p("Medals", "https://www.amazon.com/AmazingSpark-Encourage-Participation-Competitions-Graduation/dp/B0FY32BSVD"),
      "Water stations",
    ],
    checklist: ["Check yard temperature", "Set course with safe spacing", "Brief handlers", "Time dogs only if calm", "Award medals", "Log heat or stress exceptions"],
  },
  splash: {
    title: "Splash into Summer",
    focus: "water",
    theme: "summer",
    summary: "Pool party celebrating summer with splash pads, pools, sprinkler play, pool-party photos, and release-run videos.",
    staff_notes: "Set up outside first, keep dogs inside, then record dogs running out once the yard is ready.",
    setup_locations: ["Small daycare yard", "Large daycare yard"],
    products: [
      p("Pool", "https://www.amazon.com/CACSPS-Foldable-Non-Slip-Backyard-Collapsible/dp/B0CX9DQ1GZ"),
      p("Splash pad", "https://www.amazon.com/SplashEZ-Splash-Extra-Sprinkler-Summer/dp/B0BPYKR658"),
      p("Large splash pad", "https://www.amazon.com/Non-Slip-Thicken-Sprinkler-Parent-Kids-Backyard/dp/B0F1NGC7GJ"),
      p("Sprinkler", "https://www.amazon.com/VIPAMZ-sprinklers-Activities-Spray-waterpark-Kids-Splashing/dp/B087FD5XHZ"),
      p("Arm floaties", "https://www.amazon.com/Floaties-6-12yrs-Inflatable-Floater-Swimming/dp/B0BS3JPSZV"),
      p("Small pool inflatable", "https://www.amazon.com/Tivray-Inflatable-Flamingo-Doggies-Swimming/dp/B0G6ZNJW74"),
      p("Bandanas", "https://www.amazon.com/Chunful-Bandanas-Triangle-Accessories-Decoration/dp/B0BWMQG54S"),
      "Bubbles",
    ],
    checklist: ["Check water depth", "Stage splash pads and pools", "Keep slipping zones clear", "Record release-run video", "Rotate dogs by comfort level", "Drain and sanitize equipment"],
  },
  patriotic: {
    title: "Red, White & Woof Bash",
    focus: "holiday",
    theme: "patriotic",
    summary: "Fourth of July themed dress-up party with backdrop photos, pup cups, bubbles, lights, and take-home bandanas.",
    staff_notes: "Avoid loud props. Keep the theme visual and calm for sound-sensitive dogs.",
    setup_locations: ["Luxury suite", "Private play yard"],
    products: [
      p("Bandanas", "https://www.amazon.com/Preboun-Patriotic-Bandanas-Triangle-Accessories/dp/B0DYP4ZPQV"),
      p("Tinsel backdrop", "https://www.amazon.com/Curtains-Backdrops-Decorations-Patriotic-Independence/dp/B08Y2XY3NK"),
      p("Hat", "https://www.amazon.com/Vehomy-Pet-Dog-Independence-Costume/dp/B092ZP24BT"),
      p("Headbands", "https://www.amazon.com/Sadnyy-Independence-Patriotic-Adjustable-Accessories/dp/B0CX5D6HQL"),
      "Pup cups",
      "Bubbles",
      "Lights",
    ],
    checklist: ["Set patriotic backdrop", "Stage bandanas", "Prepare pup cups", "Take calm photos", "Give bandanas to go home", "Remove small props immediately"],
  },
};

const WEDNESDAY_EVENTS = {
  bubble: {
    title: "Bubble Day",
    focus: "movement",
    theme: "spring",
    summary: "Bubble guns and bubble machines in daycare with videos and photos of dogs interacting with bubbles.",
    staff_notes: "Use dog-safe bubbles and stop for dogs who appear overstimulated.",
    setup_locations: ["Indoor daycare room", "Outdoor daycare yard"],
    products: [
      p("Bubble guns", "https://www.amazon.com/EagleStone-Toddlers-Automatic-Solution-Birthday/dp/B0BNBK5PF6"),
      p("Bubble machine", "https://www.amazon.com/Upgraded-Automatic-Rotation-Rechargeable-Activities/dp/B0DPQBS27W"),
      "Dog-safe bubbles",
    ],
    checklist: ["Test bubble machine", "Open space before starting", "Record reaction clips", "Rotate overstimulated dogs out", "Clean slick areas"],
  },
  splashPad: {
    title: "Splash Pad Party",
    focus: "water",
    theme: "summer",
    summary: "Water activity using splash pads, pools, and sprinklers, with dogs released after the yard is fully staged.",
    staff_notes: "Best as a free Wednesday draw for daycare dogs.",
    setup_locations: ["Small daycare yard", "Large daycare yard"],
    products: [
      p("Pool", "https://www.amazon.com/Jasonwell-Foldable-Collapsible-48inch-D-11-8inch-H/dp/B01I3DIWDM"),
      p("Splash pad", "https://www.amazon.com/SplashEZ-Splash-Extra-Sprinkler-Summer/dp/B0BPYKR658"),
      p("Large splash pad", "https://www.amazon.com/Non-Slip-Thicken-Sprinkler-Parent-Kids-Backyard/dp/B0F1NGC7GJ"),
      p("Sprinkler", "https://www.amazon.com/VIPAMZ-sprinklers-Activities-Spray-waterpark-Kids-Splashing/dp/B087FD5XHZ"),
      p("Small pool inflatable", "https://www.amazon.com/Tivray-Inflatable-Flamingo-Doggies-Swimming/dp/B0G6ZNJW74"),
    ],
    checklist: ["Stage water equipment", "Confirm non-slip paths", "Record dogs running out", "Rotate timid dogs slowly", "Drain and sanitize"],
  },
  clientAppreciation: {
    title: "Client Appreciation",
    focus: "client",
    theme: "spring",
    summary: "Monthly thank-you event for pet parents with a decorated table, light refreshments, snacks, and optional giveaways.",
    staff_notes: "Giveaways can include store credit, ice cream, enrichment, bath, or another low-friction surprise.",
    setup_locations: ["Lobby", "Front desk"],
    products: ["Decorated table", "Light refreshments", "Client snacks", "Giveaway cards"],
    checklist: ["Set lobby table", "Brief CSRs on talking points", "Prepare giveaways", "Thank clients by name when possible", "Restock table through pickup rush"],
  },
  spa: {
    title: "Spa Day",
    focus: "spa",
    theme: "spring",
    summary: "$25 bath special offered on the last Wednesday of the month.",
    staff_notes: "Use this as a clear daycare add-on push and schedule bath capacity before advertising heavily.",
    setup_locations: ["Bathing area", "Front desk"],
    products: ["Bath supplies", "Spa photo props", "Sign-up sheet"],
    checklist: ["Confirm bath capacity", "Place sign-up sheet", "Brief CSRs on $25 offer", "Photograph clean spa moments", "Track completed baths"],
  },
};

const BRAIN_BOOST = {
  "Puzzle Challenge": {
    focus: "brainwork",
    summary: "Puzzle feeder and treat-solving session focused on confidence and problem-solving.",
    staff_notes: "This is enrichment, not training. Let the dog problem-solve without cueing, coaching, or forcing participation.",
    setup_locations: ["Quiet enclosed space", "Private play yard", "Luxury suite"],
    products: [p("Treat puzzles", LESSON_PRODUCT_LINKS.treatPuzzles), "High-value treats or dog food"],
    checklist: ["Pick puzzle by skill level", "Portion treats", "Offer calm choice-based access", "End early if frustrated or guarding", "Sanitize puzzle"],
  },
  "Scent Discovery and Search": {
    focus: "brainwork",
    summary: "Sniff-and-search game using hidden treats or scented targets.",
    staff_notes: "Keep it low pressure. Let the dog investigate rather than directing obedience-style searching.",
    setup_locations: ["Quiet enclosed space", "Private play yard", "Luxury suite"],
    products: [p("Scent bags", LESSON_PRODUCT_LINKS.scentBags), "Boxes or containers"],
    checklist: ["Hide targets safely", "Run one dog at a time", "Reward interest and finds", "Reset scent course", "Remove damaged boxes or containers"],
  },
  "Ball Pit Brain Work": {
    focus: "brainwork",
    summary: "Treat search in a ball pit or soft obstacle setup.",
    staff_notes: "Use a shallow search setup for first-time dogs. Private playtime dogs need supplies washed between uses.",
    setup_locations: ["Quiet enclosed space", "Private play yard", "Luxury suite"],
    products: [p("Plastic kiddie pool", LESSON_PRODUCT_LINKS.plasticKiddiePool), p("Ball-pit balls", LESSON_PRODUCT_LINKS.ballPitBalls), "High-value treats"],
    checklist: ["Check ball pit cleanliness", "Hide treats shallowly", "Supervise mouthy dogs", "End early if overstimulated", "Clean after session"],
  },
  "Curiosity Rings": {
    focus: "movement",
    summary: "Movement and confidence exercise using rings, hoops, or shaped targets.",
    staff_notes: "Reward voluntary investigation. Do not cue, coach, or turn this into obedience work.",
    setup_locations: ["Quiet enclosed space", "Private play yard", "Luxury suite"],
    products: [p("Button-style bell", LESSON_PRODUCT_LINKS.buttonBell), p("Hanging bell cluster", LESSON_PRODUCT_LINKS.hangingBellCluster), p("Single bell on rope", LESSON_PRODUCT_LINKS.singleBellRope), "High-value treats"],
    checklist: ["Stage bells or curiosity items safely", "Reward voluntary investigation", "Avoid forced touching or jumps", "Keep one dog at a time", "Reset supplies"],
  },
  "Frozen Focus": {
    focus: "brainwork",
    summary: "Calming enrichment with frozen lick mats or frozen treat puzzles.",
    staff_notes: "Check dietary restrictions before using any filling. Stop if the dog chews the item instead of licking calmly.",
    setup_locations: ["Quiet enclosed space", "Luxury suite"],
    products: [p("Pupsicle-style enrichment ball", LESSON_PRODUCT_LINKS.pupsicleBall), p("Pupsicle mold", LESSON_PRODUCT_LINKS.pupsicleMold), "Frozen allergy-safe filling"],
    checklist: ["Check ingredients and allergies", "Assign frozen item by dog", "Monitor chewing", "Limit session length", "Sanitize after use"],
  },
  "Cover and Discover": {
    focus: "brainwork",
    summary: "Find-it game with covered cups, towels, or boxes.",
    staff_notes: "Start easy so dogs can succeed, then increase difficulty only if they stay engaged and calm.",
    setup_locations: ["Quiet enclosed space", "Private play yard", "Luxury suite"],
    products: [p("Muffin tins", LESSON_PRODUCT_LINKS.muffinTins), p("Tennis balls", LESSON_PRODUCT_LINKS.tennisBalls), "High-value treats"],
    checklist: ["Use safe covers", "Hide treats visibly at first", "Increase difficulty gradually", "End early if guarding appears", "Sanitize tins and balls"],
  },
  "Texture and Trust": {
    focus: "movement",
    summary: "Confidence walk across safe textures and surfaces.",
    staff_notes: "Let dogs approach each surface voluntarily. No pulling, forcing, or repeated command work.",
    setup_locations: ["Quiet enclosed space", "Private play yard", "Luxury suite"],
    products: [p("Rubber or silicone texture mats", LESSON_PRODUCT_LINKS.textureMats), p("Non-slip backing", LESSON_PRODUCT_LINKS.textureMats), "Treats"],
    checklist: ["Check surfaces for safety", "Let dogs approach voluntarily", "Reward each texture", "Skip any surface the dog avoids", "Clean mats"],
  },
  "Move with Intention": {
    focus: "movement",
    summary: "Structured movement session with calm directional cues.",
    staff_notes: "Keep movement slow and deliberate. This is a calm mental activity, not agility training.",
    setup_locations: ["Quiet enclosed space", "Private play yard", "Luxury suite"],
    products: [p("Agility cones and ground-level poles", LESSON_PRODUCT_LINKS.agilityConesPoles), "Treats"],
    checklist: ["Set a simple low-pressure route", "Use calm handler movement", "Reward turns and stops", "Avoid skill promises", "Log dogs who need easier work"],
  },
  "Calm and Focused Licking": {
    focus: "brainwork",
    summary: "Quiet decompression through lick mats and focused food puzzles.",
    staff_notes: "This should be calm decompression. Stop if the dog becomes possessive, stressed, or uninterested.",
    setup_locations: ["Quiet enclosed space", "Luxury suite"],
    products: [p("Lick mats", LESSON_PRODUCT_LINKS.lickMats), "Dog-safe spreads"],
    checklist: ["Prep mats with approved spread", "Place dog with space", "Limit session length", "Watch for guarding or chewing", "Sanitize mats"],
  },
  "Forage and Focus": {
    focus: "brainwork",
    summary: "Foraging session using treat scatter, snuffle mats, or scent stations.",
    staff_notes: "Great for high-energy dogs who need mental stimulation. Keep food scatter light and controlled.",
    setup_locations: ["Quiet enclosed space", "Private play yard", "Luxury suite"],
    products: [p("Silicone snuffle mat", LESSON_PRODUCT_LINKS.snuffleMat), "Small treats"],
    checklist: ["Check dietary restrictions", "Scatter lightly", "Supervise resource guarding", "End before frustration", "Clean mat and area"],
  },
};

const MAY_BRAIN_BOOST_SCHEDULE = [
  [1, "Puzzle Challenge"],
  [2, "Scent Discovery and Search"],
  [3, "Ball Pit Brain Work"],
  [4, "Curiosity Rings"],
  [6, "Frozen Focus"],
  [8, "Cover and Discover"],
  [9, "Texture and Trust"],
  [10, "Puzzle Challenge"],
  [11, "Move with Intention"],
  [13, "Ball Pit Brain Work"],
  [15, "Calm and Focused Licking"],
  [16, "Forage and Focus"],
  [17, "Curiosity Rings"],
  [18, "Ball Pit Brain Work"],
  [20, "Calm and Focused Licking"],
  [22, "Scent Discovery and Search"],
  [23, "Frozen Focus"],
  [27, "Cover and Discover"],
  [29, "Move with Intention"],
  [30, "Puzzle Challenge"],
  [31, "Ball Pit Brain Work"],
];

const JUNE_BRAIN_BOOST_SCHEDULE = [
  [1, "Curiosity Rings"],
  [5, "Puzzle Challenge"],
  [6, "Scent Discovery and Search"],
  [7, "Ball Pit Brain Work"],
  [8, "Cover and Discover"],
  [12, "Texture and Trust"],
  [13, "Frozen Focus"],
  [14, "Move with Intention"],
  [15, "Puzzle Challenge"],
  [19, "Forage and Focus"],
  [20, "Ball Pit Brain Work"],
  [21, "Calm and Focused Licking"],
  [22, "Scent Discovery and Search"],
  [26, "Cover and Discover"],
  [27, "Texture and Trust"],
  [28, "Puzzle Challenge"],
  [29, "Frozen Focus"],
];

function productObjects(names) {
  return (names || []).map((item) => {
    if (item && typeof item === "object") {
      return {
        name: item.name || "",
        quantity: item.quantity || "",
        url: item.url || "",
        status: item.status || "reference",
      };
    }
    return {
      name: item,
      quantity: "",
      url: "",
      status: "reference",
    };
  });
}

function makeEvent({ id, date, title, source, customerVisible = false, priceCents = DEFAULT_PRICE_CENTS, category = "Brain Boost", overrides = {} }) {
  const base = source || BRAIN_BOOST[title] || {};
  const setupLocations = overrides.setup_locations || base.setup_locations || ["Daycare room", "Private play yard"];
  return {
    id,
    legacy_source_id: id,
    location_id: "demo",
    event_date: date,
    title,
    subtitle: overrides.subtitle || "",
    category: overrides.category || category,
    focus_area: overrides.focus || base.focus || "brainwork",
    visual_theme: overrides.theme || base.theme || "neutral",
    customer_visible: customerVisible,
    price_cents: priceCents,
    status: "planned",
    summary: overrides.summary || base.summary || "",
    sop_details: overrides.sop_details || base.summary || "",
    staff_notes: overrides.staff_notes || base.staff_notes || "",
    setup_locations: setupLocations,
    products: productObjects(overrides.products || base.products || []),
    checklist: overrides.checklist || base.checklist || [],
    calendar_note: overrides.calendar_note || "",
    source_label: overrides.source_label || "Imported starter calendar",
    created_at: "2026-05-05T00:00:00.000Z",
    updated_at: "2026-05-05T00:00:00.000Z",
  };
}

function sopEvent(idSuffix, date, key) {
  const sop = SOP_EVENTS[key];
  return makeEvent({
    id: `seed-${date}-${idSuffix}`,
    date,
    title: sop.title,
    source: sop,
    customerVisible: true,
    category: "Weekly Theme",
  });
}

function wednesdayEvent(idSuffix, date, key, customerVisible = true, priceCents = DEFAULT_PRICE_CENTS) {
  const event = WEDNESDAY_EVENTS[key];
  return makeEvent({
    id: `seed-${date}-${idSuffix}`,
    date,
    title: event.title,
    source: event,
    customerVisible,
    priceCents,
    category: key === "spa" ? "Spa Special" : "Wednesday Feature",
  });
}

export const SEED_ENRICHMENT_EVENTS = [
  ...MAY_BRAIN_BOOST_SCHEDULE.map(([day, title]) => makeEvent({
    id: `seed-2026-05-${String(day).padStart(2, "0")}-${slugify(title)}`,
    date: `2026-05-${String(day).padStart(2, "0")}`,
    title,
  })),
  sopEvent("cinco", "2026-05-05", "cinco"),
  wednesdayEvent("bubble", "2026-05-06", "bubble"),
  sopEvent("cinco", "2026-05-07", "cinco"),
  makeEvent({
    id: "seed-2026-05-10-mothers-day",
    date: "2026-05-10",
    title: "Mother's Day",
    customerVisible: true,
    priceCents: 0,
    category: "Holiday",
    overrides: {
      focus: "client",
      theme: "spring",
      summary: "Mother's Day client-facing photo moment and lobby acknowledgement.",
      products: ["Mother's Day photo prop", "Lobby sign", "Small giveaway"],
      checklist: ["Set photo prop", "Brief CSRs", "Capture photos for opted-in dogs", "Keep lobby display tidy"],
    },
  }),
  sopEvent("prom", "2026-05-12", "prom"),
  wednesdayEvent("client-appreciation", "2026-05-13", "clientAppreciation"),
  sopEvent("prom", "2026-05-14", "prom"),
  sopEvent("bbq", "2026-05-19", "bbq"),
  wednesdayEvent("splash-pad", "2026-05-20", "splashPad"),
  sopEvent("bbq", "2026-05-21", "bbq"),
  makeEvent({
    id: "seed-2026-05-24-backyard-bbq-boot-camp",
    date: "2026-05-24",
    title: "Backyard BBQ & Boot Camp",
    customerVisible: true,
    category: "Weekend Feature",
    overrides: {
      focus: "movement",
      theme: "summer",
      summary: "Weekend backyard BBQ photo setup with a light boot-camp style movement course.",
      products: ["BBQ decor", "Cones", "Agility props", "Bandanas"],
      checklist: ["Set BBQ decor", "Build low-impact route", "Check heat", "Record movement clips", "Reset course"],
    },
  }),
  makeEvent({
    id: "seed-2026-05-25-memorial-day",
    date: "2026-05-25",
    title: "Happy Memorial Day",
    customerVisible: true,
    priceCents: 0,
    category: "Holiday",
    overrides: {
      focus: "holiday",
      theme: "patriotic",
      summary: "Patriotic customer calendar marker and low-effort photo backdrop if staffing allows.",
      products: ["Patriotic backdrop", "Bandanas"],
      checklist: ["Keep decor simple", "Avoid loud props", "Use as photo moment only if operations are stable"],
    },
  }),
  sopEvent("bee", "2026-05-26", "bee"),
  wednesdayEvent("spa", "2026-05-27", "spa", true, 2500),
  sopEvent("bee", "2026-05-28", "bee"),
  ...JUNE_BRAIN_BOOST_SCHEDULE.map(([day, title]) => makeEvent({
    id: `seed-2026-06-${String(day).padStart(2, "0")}-${slugify(title)}`,
    date: `2026-06-${String(day).padStart(2, "0")}`,
    title,
  })),
  sopEvent("camp", "2026-06-02", "camp"),
  wednesdayEvent("bubble", "2026-06-03", "bubble"),
  sopEvent("camp", "2026-06-04", "camp"),
  sopEvent("luau", "2026-06-09", "luau"),
  wednesdayEvent("client-appreciation", "2026-06-10", "clientAppreciation"),
  sopEvent("luau", "2026-06-11", "luau"),
  sopEvent("relay", "2026-06-16", "relay"),
  wednesdayEvent("splash-pad", "2026-06-17", "splashPad"),
  sopEvent("relay", "2026-06-18", "relay"),
  sopEvent("splash", "2026-06-23", "splash"),
  wednesdayEvent("spa", "2026-06-24", "spa", true, 2500),
  sopEvent("splash", "2026-06-25", "splash"),
  sopEvent("patriotic", "2026-06-30", "patriotic"),
];

export function normalizeEnrichmentEvent(row, locationId = "demo") {
  if (!row) return null;
  return {
    id: row.id || row.legacy_source_id || `event-${row.event_date}-${slugify(row.title || "untitled")}`,
    legacy_source_id: row.legacy_source_id || row.id || null,
    location_id: row.location_id || locationId,
    event_date: normalizeDate(row.event_date),
    title: row.title || "Untitled Event",
    subtitle: row.subtitle || "",
    category: row.category || "Brain Boost",
    focus_area: row.focus_area || row.focus || "brainwork",
    visual_theme: row.visual_theme || row.theme || "neutral",
    customer_visible: Boolean(row.customer_visible),
    price_cents: Number.isFinite(Number(row.price_cents)) ? Number(row.price_cents) : DEFAULT_PRICE_CENTS,
    status: row.status || "planned",
    summary: row.summary || "",
    sop_details: row.sop_details || row.description || row.summary || "",
    staff_notes: row.staff_notes || "",
    setup_locations: normalizeStringArray(row.setup_locations),
    products: normalizeProducts(row.products),
    checklist: normalizeStringArray(row.checklist),
    calendar_note: row.calendar_note || "",
    source_label: row.source_label || "",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

export function mergeEnrichmentEvents(primaryRows = [], fallbackRows = [], locationId = "demo") {
  const map = new Map();
  fallbackRows
    .map((row) => normalizeEnrichmentEvent(row, locationId))
    .filter(Boolean)
    .forEach((event) => map.set(eventKey(event), event));
  primaryRows
    .map((row) => normalizeEnrichmentEvent(row, locationId))
    .filter(Boolean)
    .forEach((event) => map.set(eventKey(event), event));
  return [...map.values()].sort(compareEvents);
}

export function filterEventsForMonth(events, monthDate, audience = "staff") {
  const start = getMonthStart(monthDate);
  const end = getMonthEnd(monthDate);
  return (events || [])
    .filter((event) => event.event_date >= start && event.event_date <= end)
    .filter((event) => {
      if (audience === "all" || audience === "staff") return true;
      return event.customer_visible;
    })
    .sort(compareEvents);
}

export function getEventsForDate(events, date, audience = "staff") {
  const day = normalizeDate(date);
  return (events || [])
    .filter((event) => event.event_date === day)
    .filter((event) => audience !== "customer" || event.customer_visible)
    .sort(compareEvents);
}

export function getNextEnrichmentEvent(events, fromDate = new Date(), audience = "staff") {
  const day = normalizeDate(fromDate);
  return (events || [])
    .filter((event) => event.event_date >= day)
    .filter((event) => audience !== "customer" || event.customer_visible)
    .sort(compareEvents)[0] || null;
}

export function buildCalendarWeeks(monthDate) {
  const start = parseLocalDate(getMonthStart(monthDate));
  const end = parseLocalDate(getMonthEnd(monthDate));
  const firstGrid = new Date(start);
  firstGrid.setDate(start.getDate() - start.getDay());
  const weeks = [];
  let cursor = new Date(firstGrid);
  for (let week = 0; week < 6; week += 1) {
    const days = [];
    for (let dow = 0; dow < 7; dow += 1) {
      days.push({
        date: normalizeDate(cursor),
        dayNumber: cursor.getDate(),
        inMonth: cursor.getMonth() === start.getMonth(),
        isToday: normalizeDate(cursor) === normalizeDate(new Date()),
      });
      cursor = addDaysLocal(cursor, 1);
    }
    weeks.push(days);
    if (cursor > end && cursor.getDay() === 0) break;
  }
  return weeks;
}

export function getMonthStart(date) {
  const parsed = parseLocalDate(date);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-01`;
}

export function getMonthEnd(date) {
  const parsed = parseLocalDate(date);
  return normalizeDate(new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0));
}

export function getMonthLabel(date) {
  const parsed = parseLocalDate(date);
  return parsed.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function addMonths(date, delta) {
  const parsed = parseLocalDate(date);
  return normalizeDate(new Date(parsed.getFullYear(), parsed.getMonth() + delta, 1));
}

export function normalizeDate(value) {
  if (!value) return normalizeDate(new Date());
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return normalizeDate(new Date(raw));
}

export function parseLocalDate(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const raw = String(value || "");
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return new Date();
}

export function formatEventDate(value, options = {}) {
  return parseLocalDate(value).toLocaleDateString("en-US", {
    weekday: options.weekday || "short",
    month: "short",
    day: "numeric",
    year: options.year ? "numeric" : undefined,
  });
}

export function getThemeConfig(themeId) {
  return ENRICHMENT_VISUAL_THEMES.find((theme) => theme.id === themeId) || ENRICHMENT_VISUAL_THEMES[ENRICHMENT_VISUAL_THEMES.length - 1];
}

export function eventKey(event) {
  return event.legacy_source_id || `${event.location_id || "demo"}|${event.event_date}|${String(event.title || "").toLowerCase()}`;
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "event";
}

export function serializeLines(value) {
  if (Array.isArray(value)) return value.join("\n");
  return String(value || "");
}

export function parseLines(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function serializeProducts(products = []) {
  return normalizeProducts(products)
    .map((product) => [product.name, product.quantity, product.url].filter(Boolean).join(" | "))
    .join("\n");
}

export function parseProducts(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, quantityOrUrl = "", explicitUrl = ""] = line.split("|").map((part) => part.trim());
      const quantityLooksLikeUrl = !explicitUrl && /^(https?:\/\/|www\.)/i.test(quantityOrUrl);
      return {
        name,
        quantity: quantityLooksLikeUrl ? "" : quantityOrUrl,
        url: quantityLooksLikeUrl ? quantityOrUrl : explicitUrl,
        status: "reference",
      };
    });
}

export function buildBlankEnrichmentEvent({ date, locationId = "demo" } = {}) {
  return normalizeEnrichmentEvent({
    id: null,
    location_id: locationId,
    event_date: normalizeDate(date || new Date()),
    title: "",
    category: "Weekly Theme",
    focus_area: "brainwork",
    visual_theme: "neutral",
    customer_visible: true,
    price_cents: DEFAULT_PRICE_CENTS,
    status: "planned",
    setup_locations: ["Daycare room"],
    products: [],
    checklist: [],
  }, locationId);
}

export function prepareEventPayload(event, locationId) {
  const normalized = normalizeEnrichmentEvent({ ...event, location_id: locationId }, locationId);
  return {
    location_id: locationId,
    legacy_source_id: normalized.legacy_source_id || normalized.id || null,
    event_date: normalized.event_date,
    title: normalized.title.trim() || "Untitled Event",
    subtitle: normalized.subtitle || null,
    category: normalized.category || "Weekly Theme",
    focus_area: normalized.focus_area || "brainwork",
    visual_theme: normalized.visual_theme || "neutral",
    customer_visible: !!normalized.customer_visible,
    price_cents: normalized.price_cents,
    status: normalized.status || "planned",
    summary: normalized.summary || null,
    sop_details: normalized.sop_details || null,
    staff_notes: normalized.staff_notes || null,
    setup_locations: normalized.setup_locations,
    products: normalized.products,
    checklist: normalized.checklist,
    calendar_note: normalized.calendar_note || null,
    source_label: normalized.source_label || "K9 Operations",
  };
}

function compareEvents(a, b) {
  if (a.event_date !== b.event_date) return a.event_date.localeCompare(b.event_date);
  if (Number(b.customer_visible) !== Number(a.customer_visible)) return Number(b.customer_visible) - Number(a.customer_visible);
  return String(a.title || "").localeCompare(String(b.title || ""));
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  if (typeof value === "string") return parseLines(value);
  return [];
}

function normalizeProducts(value) {
  if (Array.isArray(value)) {
    return value
      .map((product) => {
        if (typeof product === "string") return { name: product, quantity: "", url: "", status: "reference" };
        return {
          name: String(product?.name || "").trim(),
          quantity: String(product?.quantity || "").trim(),
          url: String(product?.url || "").trim(),
          status: product?.status || "reference",
        };
      })
      .filter((product) => product.name);
  }
  if (typeof value === "string") return parseProducts(value);
  return [];
}

function addDaysLocal(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
