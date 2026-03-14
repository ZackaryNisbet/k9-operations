const TRACKER_DATA = {
  lastUpdated: "2026-03-14T11:35:00-04:00",
  tasks: [
    // ─── Customer Lifecycle Module ───
    {
      id: "CLM-001",
      title: "Old From Gingr Sync Tab",
      category: "Customer Lifecycle",
      priority: "P1",
      status: "done",
      description: "Implement 14-day threshold for conversion records on initial Gingr sync.",
      spec: "There are ~2.5k records in conversion after initial Gingr sync — not helpful for the team. This will be a common issue as we onboard older resorts.\n\n**Solution:**\n- Create a new tab called \"Old From Gingr Sync\" within the Customer Lifecycle module\n- Any conversion records created **within 14 days** of the sync date stay in the main \"Conversion\" tab\n- All older records move to \"Old From Gingr Sync\" tab\n- The \"Old From Gingr Sync\" tab functions identically to the Conversion tab — same columns, filters, and actions\n- This highlights the problem with Gingr letting stale data build up, while keeping the main view clean and actionable\n\n**Why 14 days?** Initially considered 1 year, but that still leaves hundreds of records. 14 days ensures only genuinely recent conversions appear in the primary workflow.",
      dataRequirements: ["gingr_owners", "lifecycle_events", "gingr_sync_metadata"],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Critical for onboarding older resorts. Must handle edge case of resorts with thousands of legacy records."
    },
    {
      id: "CLM-002",
      title: "Remove Mass Text Button",
      category: "Customer Lifecycle",
      priority: "P2",
      status: "done",
      description: "Remove the non-functional mass text button from K9 Ops Lite.",
      spec: "The \"Mass Text\" button exists in the Customer Lifecycle module but does not work on the K9 Ops Lite version. This is a POS-only feature.\n\n**Action:** Remove the button entirely from the Lite app UI to avoid confusion.",
      dataRequirements: [],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Simple UI removal. No backend changes needed."
    },
    {
      id: "CLM-003",
      title: "New Client Form",
      category: "Customer Lifecycle",
      priority: "P1",
      status: "backlog",
      description: "Build a fully functional new client form matching the POS app UI.",
      spec: "The current \"New Client\" form is completely non-functional. We need the same UI and behavior from the POS app.\n\n**Requirements:**\n- Match the POS app's new client creation form layout and fields\n- Integrate with the Field Mapping module (CLM-004) so required fields are enforced\n- All fields must map to Gingr-compatible data structures for eventual push-to-Gingr functionality\n- Include both client fields and dog fields\n- Validation on required fields before submission\n- Success/error feedback after creation",
      dataRequirements: ["gingr_owners", "gingr_animals", "field_mappings"],
      dependencies: ["CLM-004"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Depends on CLM-004 (Field Mapping) being at least partially designed so we know which fields to include."
    },
    {
      id: "CLM-004",
      title: "Required Fields / Field Mapping Module",
      category: "Customer Lifecycle",
      priority: "P1",
      status: "done",
      description: "Two-column field mapping UI between K9 Ops Lite and Gingr fields in Settings.",
      spec: "Vision: A two-column module in Settings showing K9 Ops Lite fields alongside Gingr fields.\n\n**K9 Ops Lite Fields Column:**\n- Auto-populated with unique K9 Ops data fields (EOD data, lifecycle data)\n- Ability to create new custom fields that feed into the new client creation form\n- Each field should have a toggle for required/optional\n- Covers both **client fields** and **dog fields**\n\n**Gingr Fields Column:**\n- Ideally pulled programmatically from Gingr API (may not be possible — might need manual config at resort setup)\n- Shows all required Gingr fields for client/dog records\n\n**Drag-and-Drop Mapping:**\n- Each field has a small dot on its side\n- Drag from one dot to another to create a mapping between K9 Ops and Gingr fields\n- Visual lines/connections showing active mappings\n\n**Purpose:** Every record we create in K9 Ops Lite should sync 1:1 to Gingr. This module ensures data compatibility.\n\nConsider renaming from \"Required Fields\" to \"Field Mapping\" in the settings nav.",
      dataRequirements: ["field_mappings", "gingr_form_definitions"],
      dependencies: ["DE-001"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "May need to investigate Gingr API capabilities for auto-pulling required fields."
    },
    {
      id: "CLM-005",
      title: "Push to Gingr Button",
      category: "Customer Lifecycle",
      priority: "P1",
      status: "backlog",
      description: "Add a button on client pages to push K9 Ops Lite data to production Gingr.",
      spec: "Add a \"Push to Gingr\" button on individual client pages.\n\n**Behavior:**\n- Uses the Field Mapping module to determine migration strategy\n- Carries over all recorded data from K9 Ops Lite\n- Pushes data to the **production** Gingr instance\n- Ensures no data is lost in the transfer\n- Should handle conflicts (client already exists in Gingr, partial data, etc.)\n\n**Note:** Gingr API is read-only for most endpoints. Need to investigate workaround — possibly direct database write, Gingr import tool, or browser automation as fallback.",
      dataRequirements: ["gingr_owners", "gingr_animals", "field_mappings"],
      dependencies: ["CLM-004"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Major blocker: Gingr API is largely read-only. Need to research workarounds."
    },
    {
      id: "CLM-006",
      title: "Dog Detail Page Enhancement",
      category: "Customer Lifecycle",
      priority: "P1",
      status: "backlog",
      description: "Match POS app dog detail UI and add vaccination data + all Gingr dog data.",
      spec: "When clicking on a client's dog, the detail page doesn't match the POS app layout and is missing key data.\n\n**Required enhancements:**\n- Match the POS app's dog detail page UI exactly\n- Pull and display **vaccination data** from Gingr\n- Show **all unique Gingr dog data** including:\n  - Breed, species, weight, age\n  - Temperament notes\n  - Feeding instructions\n  - Medications\n  - Vet information\n  - Custom animal icons\n  - Immunization records\n\nThis requires the Data Expansion phases to provide the underlying data.",
      dataRequirements: ["gingr_animals", "immunizations", "medications", "feeding_schedules", "vets", "animal_icons"],
      dependencies: ["DE-004"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Depends on DE-004 (Animal Enrichment data expansion) for full data availability."
    },
    {
      id: "CLM-007",
      title: "Remove Message Button",
      category: "Customer Lifecycle",
      priority: "P3",
      status: "done",
      description: "Remove the non-functional message button from client pages in K9 Ops Lite.",
      spec: "The \"Message\" button on the client page should be removed since K9 Ops Lite does not have messaging capabilities. This is a POS-only feature.",
      dataRequirements: [],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" },
        { date: "2026-03-14", entry: "Completed by agent/client-detail. Message button removed from ClientDetailPage.jsx header actions. Merged to main." }
      ],
      screenshots: [],
      notes: "Done. One line removal — clean merge."
    },
    {
      id: "CLM-008",
      title: "Lifecycle Event Logging",
      category: "Customer Lifecycle",
      priority: "P1",
      status: "backlog",
      description: "Auto-log lifecycle events on sync, stage transitions, and display on client pages.",
      spec: "Every customer in the lifecycle module should have at least 1 log entry. Currently they all show 0.\n\n**Requirements:**\n- **Initial sync logging:** When the Gingr sync runs, each client should get a log entry like \"Identified as [Conversion/Retention/etc.] client during initial sync on [date]\"\n- **Stage transition logging:** When a client moves from one lifecycle stage to another (e.g., Conversion → Retention), auto-log the transition with timestamp\n- **Dual display:** All lifecycle events should be stored and visible in:\n  1. The \"Updates\" column on the Customer Lifecycle module table\n  2. The \"Lifecycle\" tab on the individual client page\n- Events should include timestamp, event type, and description",
      dataRequirements: ["lifecycle_events", "gingr_owners"],
      dependencies: ["DE-007"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Retroactive logging needed for existing synced clients."
    },
    {
      id: "CLM-009",
      title: "Remove Online Booking Button",
      category: "Customer Lifecycle",
      priority: "P3",
      status: "done",
      description: "Remove irrelevant online booking button from Customer Lifecycle module.",
      spec: "The \"Online Booking\" button on the Customer Lifecycle module is irrelevant for the K9 Ops Lite app and should be removed.",
      dataRequirements: [],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Simple UI removal."
    },
    {
      id: "CLM-010",
      title: "Investigate 'Standard' Reservation Types",
      category: "Customer Lifecycle",
      priority: "P2",
      status: "done",
      description: "Research what 'Standard' reservation types are in past reservations data.",
      spec: "When viewing past reservations for existing clients, many appointments are labeled \"Standard\" — unclear what these represent.\n\n**Tasks:**\n- Investigate the Gingr data to determine what \"Standard\" reservation type maps to\n- Determine if these should be renamed, recategorized, or filtered\n- Document findings and propose solution",
      dataRequirements: ["gingr_reservations"],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Investigation task — may lead to follow-up implementation work."
    },
    {
      id: "CLM-011",
      title: "Fix Total Spent on Client Page",
      category: "Customer Lifecycle",
      priority: "P2",
      status: "done",
      description: "Sync the total spent value between Customer Lifecycle table and individual client pages.",
      spec: "The \"Total Spent\" field on the individual client page does not update accurately. The Customer Lifecycle module table shows what appears to be the correct total spent, but this value is not reflected on the client detail page.\n\n**Fix:** Ensure both views pull from the same data source and display consistent values.",
      dataRequirements: ["gingr_owners", "invoices", "transactions"],
      dependencies: ["DE-003"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "May depend on DE-003 (Financial Data expansion) for accurate transaction totals."
    },
    {
      id: "CLM-012",
      title: "Review 'More Columns' Button Relevance",
      category: "Customer Lifecycle",
      priority: "P3",
      status: "done",
      description: "Evaluate whether the 'More Columns' button makes sense for K9 Ops Lite.",
      spec: "The \"More Columns\" button in the Customer Lifecycle module → Active Customers section was originally built for the K9 Ops POS app. Evaluate whether it's useful for the Lite version.\n\n**Decision needed:** Keep, modify, or remove based on what columns are relevant to Lite users.",
      dataRequirements: [],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Low priority. Evaluate during Customer Lifecycle polish phase."
    },

    // ─── Operations Hub ───
    {
      id: "OPS-001",
      title: "Dashboard Consolidation",
      category: "Operations Hub",
      priority: "P0",
      status: "backlog",
      description: "Merge Today's Progress + Revenue Intelligence + Funnel into one master Dashboard page.",
      spec: "Consolidate three separate reports into one unified Dashboard:\n\n**Current separate pages:**\n1. Today's Progress — daily ops report for management/employees\n2. Revenue Intelligence — financial metrics and trends\n3. Funnel — conversion/pipeline data\n\n**Consolidated Dashboard vision:**\n- Single, clean master UI (inspired by [this X post](https://x.com/tanjim38/status/2032715653472309431))\n- Permission-based sections: CSRs/PCTs should NOT see revenue/funnel data\n- Metrics should have animated transitions when data updates (like current funnel + revenue intelligence animations)\n- UI elements don't need to be uniform size — vary based on data importance\n- Rename to \"Dashboard\" and move to top of navbar\n\n**Metrics to include (from Revenue Intelligence):**\n- Keep: All revenue metrics, key performance indicators\n- Remove: Top Category, Booking Source, Payment Method\n- Consolidate: Accrual Revenue and Net Revenue (appear to be the same)\n\n**Timeframe selectors:** WTD, Past Week, MTD, Past 30, QTD, YTD, Lifetime, Custom",
      dataRequirements: ["gingr_reservations", "invoices", "transactions", "lifecycle_events"],
      dependencies: ["DASH-001"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" },
        { date: "2026-03-14", entry: "Fixed circular dependency — OPS-001 now depends on DASH-001 only. DASH-002 (permissions) applies after." }
      ],
      screenshots: [],
      notes: "This is the flagship feature — the first thing users see when they log in. Needs to look world-class."
    },
    {
      id: "OPS-002",
      title: "Move Dashboard to Top of Navbar",
      category: "Operations Hub",
      priority: "P1",
      status: "backlog",
      description: "Reposition Dashboard as the first/top item in the navigation bar.",
      spec: "The consolidated Dashboard should be the very first thing users see when logging in. Move it to the top of the navbar hierarchy.\n\nThis is a powerful first impression — the daily ops overview should be front and center.",
      dataRequirements: [],
      dependencies: ["OPS-001"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Depends on Dashboard Consolidation being complete."
    },
    {
      id: "OPS-003",
      title: "Revenue Intelligence Timeframe Selectors",
      category: "Operations Hub",
      priority: "P1",
      status: "backlog",
      description: "Replace current timeframe selectors with WTD, Past Week, MTD, Past 30, QTD, YTD, Lifetime, Custom.",
      spec: "The current Revenue Intelligence timeframe selectors need to be replaced with a better set:\n\n**New timeframe options:**\n- WTD (Week to Date)\n- Past Week\n- MTD (Month to Date)\n- Past 30 (days)\n- QTD (Quarter to Date)\n- YTD (Year to Date)\n- Lifetime\n- Custom (date range picker)\n\n**Behavior:** When selecting any timeframe, all individual metrics on the consolidated dashboard should animate with smooth transitions between current and new values.",
      dataRequirements: ["invoices", "transactions", "gingr_reservations"],
      dependencies: ["OPS-001"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Animation between states is key — match existing funnel + revenue intelligence transition style."
    },
    {
      id: "OPS-004",
      title: "Remove Top Category from Revenue Intelligence",
      category: "Operations Hub",
      priority: "P3",
      status: "backlog",
      description: "Remove the Top Category metric from the Revenue Intelligence report.",
      spec: "Top Category is not a useful metric. Remove it from the Revenue Intelligence section of the consolidated dashboard.",
      dataRequirements: [],
      dependencies: ["OPS-001"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Simple removal during dashboard consolidation."
    },
    {
      id: "OPS-005",
      title: "Consolidate Accrual/Net Revenue",
      category: "Operations Hub",
      priority: "P2",
      status: "backlog",
      description: "Investigate and merge Total Accrual Revenue and Net Revenue if they're the same metric.",
      spec: "Total Accrual Revenue and Net Revenue appear to be the same value. Investigate whether they are truly identical and consolidate into a single metric if so.",
      dataRequirements: ["invoices", "transactions"],
      dependencies: ["OPS-001"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Need to verify data sources before consolidating."
    },
    {
      id: "OPS-006",
      title: "Remove Booking Source & Payment Method",
      category: "Operations Hub",
      priority: "P3",
      status: "backlog",
      description: "Remove Booking Source and Payment Method metrics from Revenue Intelligence.",
      spec: "Booking Source and Payment Method are not useful metrics for the consolidated dashboard. Remove them.",
      dataRequirements: [],
      dependencies: ["OPS-001"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Simple removal during dashboard consolidation."
    },
    {
      id: "OPS-007",
      title: "Checklist Timestamp Logging",
      category: "Operations Hub",
      priority: "P2",
      status: "done",
      description: "Log timestamps when checklist items are completed, not just the user who completed them.",
      spec: "Opening and Closing checklists currently show which user completed each item, but do not log the timestamp.\n\n**Fix:** Add timestamp logging for each checklist item completion. Display as \"Completed by [User] at [Time]\".",
      dataRequirements: ["checklists"],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: ""
    },
    {
      id: "OPS-008",
      title: "Checklist Auto-Save",
      category: "Operations Hub",
      priority: "P2",
      status: "done",
      description: "Auto-save checklist selections instead of prompting 'Save Changes'.",
      spec: "Currently, selecting a checklist item prompts \"Save Changes\" — but not all reports behave this way. Checklists should auto-save when items are toggled, matching the behavior of other interactive elements in the app.",
      dataRequirements: ["checklists"],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: ""
    },
    {
      id: "OPS-009",
      title: "Standardize Checkbox UI Across Reports",
      category: "Operations Hub",
      priority: "P2",
      status: "done",
      description: "Ensure consistent checkbox styling across all reports and checklists.",
      spec: "Checklists have checkboxes on the left side, but not all reports follow the same pattern. Standardize the checkbox UI across the entire app based on world-class UI expectations.\n\n**Audit all reports** and ensure consistent checkbox placement, styling, and interaction patterns.",
      dataRequirements: [],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Design consistency task — affects multiple modules."
    },
    {
      id: "OPS-010",
      title: "Front-End/Back-End Checklist Template Import",
      category: "Operations Hub",
      priority: "P2",
      status: "done",
      description: "Import POS app checklist templates as defaults for K9 Ops Lite.",
      spec: "The Front-End and Back-End checklists are properly configured on the POS app but are very condensed on the Lite app.\n\n**Requirements:**\n- Import the full checklist items from the POS app\n- Make these the default template for K9 Ops Lite locations\n- At the enterprise level, support customizing templates and pushing them to individual locations",
      dataRequirements: ["checklists"],
      dependencies: ["ENT-002"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Ties into enterprise checklist template management (ENT-002)."
    },
    {
      id: "OPS-011",
      title: "Remove 'Today: 0/6 Completed' Section",
      category: "Operations Hub",
      priority: "P3",
      status: "done",
      description: "Remove the 'Today: 0/6 Completed' section and 'View Analytics' button from Ops Hub.",
      spec: "The section in Ops Hub showing \"Today: 0/6 Completed\" and the \"View Analytics\" button should be removed entirely.",
      dataRequirements: [],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Simple UI removal."
    },
    {
      id: "OPS-012",
      title: "Fix EOD @ Mention Dog Suggest",
      category: "Operations Hub",
      priority: "P2",
      status: "done",
      description: "Fix the broken @ mention dog suggestion feature in the EOD report.",
      spec: "The \"@\" hyperlink suggest dog feature in the EOD (End of Day) report does not work. Fix the autocomplete/suggestion functionality so that typing \"@\" shows a dropdown of dogs that can be mentioned in the report.",
      dataRequirements: ["gingr_animals"],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Bug fix — needs investigation into why the suggestion dropdown fails."
    },
    {
      id: "OPS-013",
      title: "Daily Email Reports",
      category: "Operations Hub",
      priority: "P1",
      status: "backlog",
      description: "Automated 8 PM daily email summarizing dashboard metrics to configurable distribution groups.",
      spec: "**Feature:** Automated daily email report sent at 8 PM local time.\n\n**Content:** Summary of all dashboard metrics for the day.\n\n**Distribution:**\n- Sent to specified distribution group(s) configured in Settings\n- Only managers can configure distribution groups\n- Emails sent as a group thread so recipients can reply and discuss\n\n**Settings integration:** Add a \"Daily Email Reports\" section in Settings where managers can:\n- Enable/disable daily emails\n- Configure recipient distribution groups\n- Set preferred send time (default 8 PM local)",
      dataRequirements: ["email_config", "gingr_reservations", "invoices"],
      dependencies: ["OPS-001"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Requires email sending infrastructure. Consider SendGrid or similar."
    },
    {
      id: "OPS-014",
      title: "Weekly Email Reports",
      category: "Operations Hub",
      priority: "P2",
      status: "backlog",
      description: "Weekly email summary report with aggregated metrics.",
      spec: "Similar to daily email reports but aggregated on a weekly basis. Include week-over-week trends and highlights.\n\nShould use the same distribution group configuration as daily emails.",
      dataRequirements: ["email_config", "gingr_reservations", "invoices"],
      dependencies: ["OPS-013"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Build after daily emails are working."
    },

    // ─── Checkout TV ───
    {
      id: "TV-001",
      title: "Fix 0 in Daycare Count",
      category: "Checkout TV",
      priority: "P1",
      status: "done",
      description: "Debug and fix the Checkout TV showing 0 dogs in daycare.",
      spec: "The Checkout TV feature shows 0 in the daycare count. Investigate why daycare dogs are not being counted and fix the data query.\n\nLikely issues:\n- Incorrect reservation type filter\n- Missing data from Gingr sync\n- Date/time zone mismatch in the query",
      dataRequirements: ["gingr_reservations", "gingr_animals"],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Bug fix — high priority for TV feature usability."
    },
    {
      id: "TV-002",
      title: "Show Dog Check-Out Status",
      category: "Checkout TV",
      priority: "P1",
      status: "done",
      description: "Display real-time check-out status for dogs on the Checkout TV.",
      spec: "The Checkout TV needs to show when a dog has been checked out. Currently it's unclear if check-out status is being tracked.\n\n**Requirements:**\n- Poll Gingr endpoint every ~1 second (minimal payload to avoid rate limits/latency)\n- When a checkout is detected, match the dog to our app's data\n- Visual indicator on the TV showing the dog has been checked out\n- Ties into TV-006 (checkout highlight animation)",
      dataRequirements: ["gingr_reservations", "gingr_animals"],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Requires real-time polling — must be extremely lightweight to avoid Gingr API issues."
    },
    {
      id: "TV-003",
      title: "Large vs Small Dog Differentiation",
      category: "Checkout TV",
      priority: "P1",
      status: "backlog",
      description: "Use custom_animal_icons to differentiate large and small dogs on TV display.",
      spec: "Differentiate between large dogs and small dogs on the Checkout TV display.\n\n**Data source:** The animal pages in Gingr store icons for \"small dog playgroup (play)\" and \"large dog playgroup (play)\".\n\n**Implementation:** Use the `custom_animal_icons` template (templates 2/3) to determine dog size classification and display accordingly on the TV.\n\nThis feeds into the TV navigation views (TV-005) which will have separate Small Daycare and Large Daycare views.",
      dataRequirements: ["gingr_animals", "animal_icons"],
      dependencies: ["DE-004"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Requires animal icon data from Data Expansion Phase 3."
    },
    {
      id: "TV-004",
      title: "Verify Room Numbers",
      category: "Checkout TV",
      priority: "P2",
      status: "done",
      description: "Verify that room numbers displayed on Checkout TV match actual resort rooms.",
      spec: "Some dogs show room numbers that don't match the actual resort. For example, a dog showing room \"1\" in Cherry Hill — that's not a valid room.\n\n**Tasks:**\n- Audit room number data from Gingr\n- Cross-reference with actual resort room configurations\n- Fix any mapping issues",
      dataRequirements: ["gingr_reservations"],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "May be a data quality issue from Gingr."
    },
    {
      id: "TV-005",
      title: "TV Navigation",
      category: "Checkout TV",
      priority: "P1",
      status: "backlog",
      description: "Add view buttons: All, Small Daycare, Large Daycare, Private Play.",
      spec: "Rename the navbar item to \"TV\". When clicked, show four navigation buttons for different full-screen views:\n\n1. **All** — The current view showing all dogs (already built)\n2. **Small Daycare** — Only small daycare dogs\n3. **Large Daycare** — Only large daycare dogs\n4. **Private Play** — Only private play dogs\n\nEach view should be a full-screen TV-optimized display.",
      dataRequirements: ["gingr_reservations", "gingr_animals", "animal_icons"],
      dependencies: ["TV-003"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Depends on large/small dog differentiation (TV-003)."
    },
    {
      id: "TV-006",
      title: "Checkout Highlight Animation",
      category: "Checkout TV",
      priority: "P1",
      status: "done",
      description: "Enlarge and highlight a dog on TV when checked out, with 60-second countdown and fade.",
      spec: "When a CSR checks a dog out (detected via Gingr polling), the TV should:\n\n1. **Enlarge** the dog's card/icon to be prominently bigger than all other dogs\n2. **Center** it on screen or overlay it on top of the grid\n3. **Start a 60-second countdown** timer visible on screen\n4. **Fade out** the dog after the 60 seconds expire\n\n**Purpose:** This serves as a tool for group play employees to know which dog to retrieve. The dog should NOT instantly disappear on checkout — the 60-second window gives staff time to see and act.\n\n**Technical:** Requires real-time checkout detection (TV-002) to trigger the animation.",
      dataRequirements: ["gingr_reservations", "gingr_animals"],
      dependencies: ["TV-002"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Signature TV feature — needs to be visually impressive and reliable."
    },

    // ─── Ignite Integration ───
    {
      id: "IGN-001",
      title: "Email Parser Setup",
      category: "Ignite",
      priority: "P0",
      status: "done",
      description: "Set up auto-forward email parsing for Ignite lead notifications.",
      spec: "**Background:** K9 Resorts uses Ignite for digital marketing. When someone fills out a form, clicks an ad, or calls a tracking number, they appear in Ignite immediately. Notifications come via email from `noreply@leads.idigitalstrategies.com` to `zack.nisbet@lphik9.com`.\n\n**Implementation:**\n1. Set up a dedicated email address for K9 Ops to receive forwarded Ignite emails\n2. Configure auto-forward from Ignite notification emails to this address\n3. Build an email parser that extracts:\n   - Client name and contact info\n   - Lead source (form, ad click, call tracking)\n   - Phone call recording URL (if applicable)\n   - All captured form fields\n   - Ignite profile/location identifier\n4. Route parsed data to the appropriate K9 Ops location based on Ignite profile #\n\n**Scale consideration:** Will need to handle 50+ resorts forwarding emails to the same parser.",
      dataRequirements: ["ignite_records", "email_config"],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Critical infrastructure piece. Must be reliable at scale (50+ resorts)."
    },
    {
      id: "IGN-002",
      title: "Client Matching Logic",
      category: "Ignite",
      priority: "P1",
      status: "backlog",
      description: "Match incoming Ignite leads to existing clients or create new records.",
      spec: "When an Ignite lead is parsed:\n\n**If client exists in K9 Ops:**\n- Match based on email, phone, or name\n- Add the Ignite record to their existing client profile\n- Show in the new \"Ignite\" section on the client page (IGN-003)\n\n**If client does NOT exist in K9 Ops:**\n- Create a new client record\n- Set the source as \"Ignite\"\n- If you click on the Ignite source indicator on the Customer Lifecycle module, it should display all details from the lead\n- Decision: Nest into the Log section or the Source Ignite dropdown on Customer Lifecycle",
      dataRequirements: ["gingr_owners", "ignite_records"],
      dependencies: ["IGN-001"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Matching logic must be fuzzy enough to catch variations but precise enough to avoid false matches."
    },
    {
      id: "IGN-003",
      title: "Ignite Section on Client Page",
      category: "Ignite",
      priority: "P1",
      status: "backlog",
      description: "Add an 'Ignite' section to client pages showing all captured lead data and call recordings.",
      spec: "Create a new \"Ignite\" section on individual client pages.\n\n**Display:**\n- All fields captured from the Ignite email (name, contact info, source, etc.)\n- Direct link to listen to phone call recordings (if applicable)\n- Timeline of all Ignite interactions for this client\n- Source attribution (which ad/form/tracking number)\n\nShould mirror the POS app's Ignite display functionality.",
      dataRequirements: ["ignite_records"],
      dependencies: ["IGN-001", "IGN-002"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: ""
    },
    {
      id: "IGN-004",
      title: "Ignite Settings",
      category: "Ignite",
      priority: "P1",
      status: "done",
      description: "Settings page to configure Ignite profile number per location.",
      spec: "Create a section in Settings for Ignite configuration.\n\n**Fields:**\n- Ignite Profile # for the current location\n- Email forwarding address (for reference)\n- Connection status indicator\n\n**Purpose:** With 50+ resorts, each location has a different Ignite profile. The profile # is used to route parsed emails to the correct K9 Ops location.",
      dataRequirements: ["ignite_config"],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Simple settings page — but critical for multi-location routing."
    },

    // ─── Enterprise ───
    {
      id: "ENT-001",
      title: "Enterprise Dashboard Aggregation",
      category: "Enterprise",
      priority: "P1",
      status: "backlog",
      description: "Aggregate dashboard data across all locations with resort selection controls.",
      spec: "The consolidated Dashboard created at the location level needs an enterprise-level equivalent.\n\n**Requirements:**\n- Same UI as the location-level Dashboard\n- Aggregates data across all configured locations\n- Extra controls to select/deselect which resorts are included\n- Dashboard updates live as resorts are toggled on/off\n- Should handle data from 50+ locations without performance issues",
      dataRequirements: ["gingr_reservations", "invoices", "transactions", "lifecycle_events"],
      dependencies: ["OPS-001"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Performance is critical — aggregating across many locations."
    },
    {
      id: "ENT-002",
      title: "Enterprise Checklist Template Management",
      category: "Enterprise",
      priority: "P2",
      status: "done",
      description: "Customize checklist templates at enterprise level and push to individual locations.",
      spec: "At the enterprise level, need the ability to:\n\n1. **Create and customize** checklist templates (opening, closing, front-end, back-end)\n2. **Set defaults** — designate a template as the default for new locations\n3. **Push templates** to individual locations or all locations at once\n4. **Override** — individual locations can customize their own if needed\n\nThis enables standardized operations across all resorts while allowing local flexibility.",
      dataRequirements: ["checklists", "enterprise_config"],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Important for scaling to 50+ locations."
    },
    {
      id: "ENT-003",
      title: "Multi-Resort Quick Setup",
      category: "Enterprise",
      priority: "P1",
      status: "done",
      description: "Bulk create and configure multiple resort locations with Gingr + Ignite integration.",
      spec: "Need a way to quickly set up multiple resorts at once.\n\n**Setup form per location:**\n- Location name\n- Gingr integration details (API key, resort ID, etc.)\n- Ignite profile #\n- Any other required fields for setup\n\n**Actions:**\n- \"Create and Sync\" for all locations at once\n- \"Create\" individually and manually choose sync per location\n- \"Create All\" without syncing any (sync later)\n\nThis eliminates the tedious one-by-one resort setup process.",
      dataRequirements: ["enterprise_config", "gingr_config", "ignite_config"],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Critical for rapid scaling to 50+ locations."
    },

    // ─── Dashboard / Reports ───
    {
      id: "DASH-001",
      title: "Dashboard UI Design",
      category: "Dashboard",
      priority: "P0",
      status: "done",
      description: "Design the consolidated Dashboard UI inspired by the referenced X post.",
      spec: "Design the master Dashboard UI that consolidates Today's Progress, Revenue Intelligence, and Funnel.\n\n**Inspiration:** [X post by @tanjim38](https://x.com/tanjim38/status/2032715653472309431) — clean, modern dashboard layout with varied widget sizes.\n\n**Key design principles:**\n- Not all UI elements need to be the same size — prioritize based on data importance\n- Clean, professional aesthetic\n- Animated metric transitions\n- Responsive layout\n- Permission-aware (different views for different roles)\n\n**This task covers the design/mockup phase.** Implementation is handled by OPS-001.",
      dataRequirements: [],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Design first, then implement via OPS-001."
    },
    {
      id: "DASH-002",
      title: "Permission-Based Dashboard Views",
      category: "Dashboard",
      priority: "P1",
      status: "backlog",
      description: "Restrict CSRs/PCTs from seeing revenue and funnel data on the Dashboard.",
      spec: "The consolidated Dashboard needs role-based views:\n\n**Managers/Owners:** See everything — ops, revenue, funnel\n**CSRs (Customer Service Reps):** See ops data only — no revenue or funnel metrics\n**PCTs (Pet Care Technicians):** See ops data only — no revenue or funnel metrics\n\nThe UI should gracefully handle restricted sections — don't show empty placeholders, just don't render the restricted widgets at all.",
      dataRequirements: [],
      dependencies: ["OPS-001"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Requires user role system to be in place."
    },

    // ─── Settings ───
    {
      id: "SET-001",
      title: "Rename Required Fields to 'Field Mapping'",
      category: "Settings",
      priority: "P2",
      status: "done",
      description: "Rename the 'Required Fields' module in Settings to 'Field Mapping'.",
      spec: "Simple rename of the Settings module from \"Required Fields\" to \"Field Mapping\" to better reflect its purpose as a mapping tool between K9 Ops and Gingr fields.",
      dataRequirements: [],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from feature requirements doc" }
      ],
      screenshots: [],
      notes: "Quick win — rename in nav and page header."
    },
    {
      id: "SET-002",
      title: "Remove Dayboarding Section from Settings",
      category: "Settings",
      priority: "P3",
      status: "completed",
      description: "Remove the irrelevant Dayboarding section from Settings.",
      spec: "The Dayboarding section in Settings has been removed as it was not relevant to K9 Ops Lite.",
      dataRequirements: [],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task completed previously — already removed" }
      ],
      screenshots: [],
      notes: "Done."
    },

    // ─── Data Expansion ───
    {
      id: "DE-001",
      title: "Phase 0 — Form Reference Tables",
      category: "Data Expansion",
      priority: "P1",
      status: "done",
      description: "Sync gingr_form_definitions and gingr_icon_templates reference tables.",
      spec: "**Phase 0** of the Data Expansion plan.\n\n**Tables to sync:**\n- `gingr_form_definitions` — Form field definitions from Gingr (required fields, field types, validation rules)\n- `gingr_icon_templates` — Icon templates used for animal display (small dog, large dog, etc.)\n\n**Purpose:** These reference tables are needed before the Field Mapping module (CLM-004) can be built, and before animal icons can be used for TV differentiation (TV-003).",
      dataRequirements: ["gingr_form_definitions", "gingr_icon_templates"],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from data expansion proposal" }
      ],
      screenshots: [],
      notes: "Foundation for CLM-004 and TV-003."
    },
    {
      id: "DE-002",
      title: "Phase 1 — Reference Tables",
      category: "Data Expansion",
      priority: "P1",
      status: "done",
      description: "Sync breeds, species, immunization types, and temperament reference tables from Gingr.",
      spec: "**Phase 1** of the Data Expansion plan.\n\n**Tables to sync:**\n- `breeds` — Dog breed reference data\n- `species` — Species types\n- `immunization_types` — Types of immunizations tracked in Gingr\n- `temperaments` — Temperament classifications\n\n**Purpose:** These reference tables are needed to properly display dog details (CLM-006) and support the Dog Detail Page Enhancement.",
      dataRequirements: ["breeds", "species", "immunization_types", "temperaments"],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from data expansion proposal" }
      ],
      screenshots: [],
      notes: "Reference data that other features depend on."
    },
    {
      id: "DE-003",
      title: "Phase 2 — Financial Data",
      category: "Data Expansion",
      priority: "P1",
      status: "done",
      description: "Sync invoices and transactions tables from Gingr.",
      spec: "**Phase 2** of the Data Expansion plan.\n\n**Tables to sync:**\n- `invoices` — All invoice records from Gingr\n- `transactions` — All transaction/payment records\n\n**Purpose:** Required for accurate revenue reporting (OPS-001, OPS-003, OPS-005), fixing Total Spent on client pages (CLM-011), and the consolidated Dashboard.",
      dataRequirements: ["invoices", "transactions"],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from data expansion proposal" }
      ],
      screenshots: [],
      notes: "Critical for revenue intelligence and dashboard accuracy."
    },
    {
      id: "DE-004",
      title: "Phase 3 — Animal Enrichment",
      category: "Data Expansion",
      priority: "P1",
      status: "done",
      description: "Sync feeding, medications, immunizations, vets, and animal icon data from Gingr.",
      spec: "**Phase 3** of the Data Expansion plan.\n\n**Tables to sync:**\n- `feeding_schedules` — Dog feeding instructions and schedules\n- `medications` — Medication records for animals\n- `immunizations` — Actual immunization records (not just types)\n- `vets` — Veterinarian information linked to animals\n- `animal_icons` — Custom animal icons/photos (includes small/large dog playgroup icons)\n\n**Purpose:** Required for the Dog Detail Page Enhancement (CLM-006), Large vs Small Dog TV differentiation (TV-003), and complete animal profiles.",
      dataRequirements: ["feeding_schedules", "medications", "immunizations", "vets", "animal_icons"],
      dependencies: ["DE-002"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from data expansion proposal" }
      ],
      screenshots: [],
      notes: "Depends on Phase 1 reference tables being in place."
    },
    {
      id: "DE-005",
      title: "Phase 4 — Client Enrichment",
      category: "Data Expansion",
      priority: "P2",
      status: "backlog",
      description: "Sync enhanced owner/animal fields and subscription data from Gingr.",
      spec: "**Phase 4** of the Data Expansion plan.\n\n**Tables to sync:**\n- Enhanced `owner` fields — Additional client data beyond basic info\n- Enhanced `animal` fields — Additional dog data beyond basic info\n- `subscriptions` — Client subscription/membership data\n\n**Purpose:** Provides complete client profiles for the Push to Gingr feature (CLM-005) and enriched client page displays.",
      dataRequirements: ["gingr_owners", "gingr_animals", "subscriptions"],
      dependencies: ["DE-004"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from data expansion proposal" }
      ],
      screenshots: [],
      notes: "Nice-to-have enrichment — not blocking core features."
    },
    {
      id: "DE-006",
      title: "Phase 5 — Verify & Test All Existing Features",
      category: "Data Expansion",
      priority: "P0",
      status: "backlog",
      description: "Comprehensive verification that all existing features work correctly with expanded data.",
      spec: "**Phase 5** of the Data Expansion plan — CRITICAL quality gate.\n\n**Scope:**\n- Test every existing feature against the expanded dataset\n- Verify data integrity across all synced tables\n- Check for performance regressions with larger data volumes\n- Validate all calculations (revenue, counts, etc.) are accurate\n- Test edge cases: missing data, null fields, timezone issues\n- Regression test all reports and dashboards\n\n**This phase must pass before any new features are built on top of expanded data.**",
      dataRequirements: [],
      dependencies: ["DE-005"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from data expansion proposal" }
      ],
      screenshots: [],
      notes: "Quality gate — blocks all downstream features from going live."
    },
    {
      id: "DE-007",
      title: "Phase 6 — Application Feature Tables",
      category: "Data Expansion",
      priority: "P1",
      status: "backlog",
      description: "Create app-specific tables: lifecycle_events, field_mappings, ignite, email, enterprise, checklists.",
      spec: "**Phase 6** of the Data Expansion plan.\n\n**Tables to create (K9 Ops-specific, not from Gingr):**\n- `lifecycle_events` — Track all lifecycle stage transitions and events\n- `field_mappings` — Store K9 Ops ↔ Gingr field mapping configurations\n- `ignite_records` — Parsed Ignite lead data\n- `email_config` — Email report distribution group settings\n- `enterprise_config` — Multi-location configuration\n- `checklists` — Checklist templates and completion records\n\n**Purpose:** These are application-level tables that power K9 Ops features independent of Gingr data.",
      dataRequirements: ["lifecycle_events", "field_mappings", "ignite_records", "email_config", "enterprise_config", "checklists"],
      dependencies: ["DE-006"],
      activityLog: [
        { date: "2026-03-14", entry: "Task created from data expansion proposal" }
      ],
      screenshots: [],
      notes: "Final data expansion phase. Enables all remaining features."
    },
    {
      id: "DE-008",
      title: "Data Expansion Proposal Document",
      category: "Data Expansion",
      priority: "P1",
      status: "done",
      description: "Comprehensive data expansion proposal document for review.",
      spec: "The Data Expansion Proposal has been created and shared. It outlines all 7 phases (0-6) of the data expansion plan, including:\n\n- Current state analysis\n- Proposed new tables and fields\n- Sync strategy and scheduling\n- Impact on existing features\n- Rollback plan\n- Timeline estimates\n\n**Status:** Reviewed and approved.",
      dataRequirements: [],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Proposal document created and shared with Zack for review" },
        { date: "2026-03-14", entry: "Proposal reviewed and approved. Moved to done." }
      ],
      screenshots: [],
      notes: "Proposal complete. Data expansion phases DE-001 through DE-007 can now proceed."
    },
    {
      id: "PUB-001",
      title: "Redesign Customer Lifecycle CRM Graphic",
      category: "Public Site",
      priority: "P2",
      status: "done",
      description: "Redesign the customer lifecycle CRM graphic on the landing page. Current triangle/node graphic looks rough and needs a polished, world-class visual.",
      spec: "**Current state:** Triangle graphic with Gingr → K9 Ops center → Conversion → Active ↔ Retention flow.\n\n**Issues:**\n- Visual quality doesn't meet the 'world class UI' bar for public-facing pages\n- Needs to clearly communicate: Gingr (external) → K9 Ops (intelligence layer) → Conversion → Active ↔ Retention\n- Customer NEVER goes back to New or Conversion once progressed\n- Active ↔ Retention is the only bidirectional flow\n\n**Requirements:**\n- Clean, polished graphic that matches the premium feel of the rest of the landing page\n- Animated or interactive preferred\n- Must be visually intuitive for prospects viewing the landing page",
      dataRequirements: [],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Logged by Zack — current CRM graphic on landing page needs redesign" }
      ],
      screenshots: [],
      notes: "Part of the public site polish. Landing page must be world-class."
    },
    {
      id: "ARCH-001",
      title: "Refactor KOL Codebase — One File Per Page",
      category: "Architecture",
      priority: "P0",
      status: "done",
      description: "Refactor the monolithic LiteApp.jsx (12,321 lines) into individual page files so multiple agents can work in parallel without merge conflicts.",
      spec: "**Completed refactor:**\n- Split LiteApp.jsx into 35 files across src/shared/, src/hooks/, src/kol/pages/, src/kol/settings/, src/kol/enterprise/\n- KolApp.jsx is the thin shell (router + sidebar)\n- Each page file has comprehensive imports from shared modules\n- Build verified clean (109 modules, 0 errors)\n- All 8 nav pages verified via Playwright — zero runtime errors\n- Original LiteApp.jsx preserved for reference\n\n**File count:** 35 files totaling 12,854 lines (extra from import headers)",
      dataRequirements: [],
      dependencies: [],
      activityLog: [
        { date: "2026-03-14", entry: "Refactor planned — regex-based extraction script (refactor_v2.py) written" },
        { date: "2026-03-14", entry: "Extraction complete — 35 files created across shared/, hooks/, kol/" },
        { date: "2026-03-14", entry: "Import fixes applied, build passing clean" },
        { date: "2026-03-14", entry: "All 8 nav pages verified via Playwright — zero runtime errors" },
        { date: "2026-03-14", entry: "Pushed to GitHub as commit 0bf8730. Marked done." }
      ],
      screenshots: [],
      notes: "Enables parallel agent development. Each agent can now own a single page file."
    }
  ]
};