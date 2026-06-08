// ─── Permissions System ──────────────────────────────────────────────────────
const PERMISSION_CATEGORIES = [
  { key:"pages", label:"Page Access", permissions:[
    {key:"view_dashboard",label:"Dashboard",desc:"View daily operations overview"},
    {key:"view_calendar",label:"Lodging Calendar",desc:"View and interact with reservation calendar"},
    {key:"view_clients",label:"Clients",desc:"Search and view client list"},
    {key:"view_client_detail",label:"Client Detail",desc:"View individual client profiles"},
    {key:"view_dog_detail",label:"Dog Detail",desc:"View individual dog profiles"},

    {key:"view_messages",label:"Messages",desc:"Access SMS message center"},
    {key:"view_payments",label:"Payments",desc:"View payment ledger and history"},
    {key:"view_daily_ops",label:"Daily Ops",desc:"View daily operation checklists"},
    {key:"view_eod",label:"End-of-Day",desc:"View end-of-day reports"},
    {key:"view_ai",label:"AI Command",desc:"Access AI chat interface"},
    {key:"view_settings",label:"Settings",desc:"Access settings pages"},
  ]},
  { key:"clients", label:"Client Management", permissions:[
    {key:"create_client",label:"Create Client",desc:"Add new client profiles"},
    {key:"edit_client",label:"Edit Client",desc:"Modify client information and agreements"},
    {key:"edit_lifecycle_banners",label:"Edit Lifecycle Banners",desc:"Edit the explainer text banners on the Customer Lifecycle page"},
  ]},
  { key:"dogs", label:"Dog Management", permissions:[
    {key:"create_dog",label:"Create Dog",desc:"Add new dog profiles"},
    {key:"edit_dog",label:"Edit Dog Profile",desc:"Modify dog basic info (name, breed, weight, etc.)"},
    {key:"edit_vaccines",label:"Edit Vaccines",desc:"Update vaccination records and expiration dates"},
    {key:"edit_feeding",label:"Edit Feeding",desc:"Modify feeding schedules and instructions"},
    {key:"edit_medications",label:"Edit Medications",desc:"Manage medication records"},
    {key:"edit_dog_tags",label:"Edit Dog Tags",desc:"Add/remove tags on dog profiles"},
  ]},
  { key:"reservations", label:"Reservation Management", permissions:[
    {key:"create_reservation",label:"Create Reservation",desc:"Book new boarding, daycare, tour, or eval reservations"},
    {key:"check_in",label:"Check In",desc:"Process reservation check-ins"},
    {key:"check_out",label:"Check Out",desc:"Process reservation check-outs"},
    {key:"cancel_reservation",label:"Cancel Reservation",desc:"Cancel existing bookings"},
    {key:"override_closed_dates",label:"Override Closed Dates",desc:"Book reservations on closed dates (holidays, blackout dates)"},
  ]},
  { key:"payments", label:"Payment Management", permissions:[
    {key:"view_payment_history",label:"View Payment History",desc:"See payment records and transaction details"},
    {key:"collect_payment",label:"Collect Payment",desc:"Process deposits and payments"},
    {key:"issue_refund",label:"Issue Refund",desc:"Process refunds on payments"},
  ]},
  { key:"operations", label:"Daily Operations", permissions:[
    {key:"edit_daily_ops",label:"Edit Checklists",desc:"Fill out daily operation checklists"},
    {key:"lock_daily_ops",label:"Lock Checklists",desc:"Lock/unlock completed checklists"},
    {key:"edit_eod",label:"Edit EOD Reports",desc:"Write and modify end-of-day reports"},
    {key:"lock_eod",label:"Lock EOD Reports",desc:"Lock/unlock completed EOD reports"},
  ]},
  { key:"messages", label:"Messaging", permissions:[
    {key:"view_message_threads",label:"View Messages",desc:"Read SMS message threads"},
    {key:"send_messages",label:"Send Messages",desc:"Send SMS messages to clients"},
  ]},
  { key:"settings", label:"Settings & Administration", permissions:[
    {key:"manage_team",label:"Manage Team",desc:"Invite, remove, and manage team members"},
    {key:"manage_roles",label:"Manage Roles",desc:"Create and edit roles and permissions"},
    {key:"edit_pricing",label:"Edit Pricing",desc:"Configure room rates, fees, and discounts"},
    {key:"edit_facility",label:"Edit Facility",desc:"Configure daycare square footage and capacity"},
    {key:"edit_rooms",label:"Edit Rooms",desc:"Manage room inventory"},
    {key:"edit_fields",label:"Edit Custom Fields",desc:"Customize client and dog profile fields"},
    {key:"edit_tags_config",label:"Edit Tag Settings",desc:"Manage dog tag definitions"},
    {key:"edit_vaccines_config",label:"Edit Vaccine Settings",desc:"Configure required vaccines and policies"},
    {key:"edit_agreements",label:"Edit Agreements",desc:"Manage boarding/daycare agreements"},
    {key:"edit_eod_template",label:"Edit EOD Template",desc:"Configure end-of-day report template"},
    {key:"edit_ops_template",label:"Edit Ops Templates",desc:"Configure daily ops checklist templates"},
    {key:"edit_dropdowns",label:"Edit Dropdown Lists",desc:"Customize breed, food, medication dropdowns"},
    {key:"reset_data",label:"Reset Data",desc:"Reset all data back to demo dataset"},
  ]},
  { key:"management", label:"Management", permissions:[
    {key:"view_management",label:"View Management",desc:"Access management tools (attendance, etc.)"},
    {key:"edit_attendance",label:"Edit Attendance",desc:"Log and edit attendance records"},
    {key:"edit_roster",label:"Edit Roster",desc:"Add or modify team roster entries"},
    {key:"view_audit_log",label:"View Audit Log",desc:"View employee login history and system activity log"},
  ]},
  { key:"developer", label:"Developer Tools", permissions:[
    {key:"use_time_travel",label:"Time Travel",desc:"Access the date simulator toolbar for testing time-dependent features"},
  ]},
  { key:"ai", label:"AI Features", permissions:[
    {key:"use_ai",label:"Use AI Command",desc:"Access and use the AI chat assistant"},
  ]},
];

const ALL_PERM_KEYS = PERMISSION_CATEGORIES.flatMap(c => c.permissions.map(p => p.key));

function buildPerms(overrides = {}) {
  const p = {};
  ALL_PERM_KEYS.forEach(k => { p[k] = overrides[k] !== undefined ? overrides[k] : false; });
  return p;
}

const DEFAULT_ROLES = [
  {
    id: "role_owner", name: "Owner", builtIn: true, color: "accent",
    description: "Full access to all features and settings",
    permissions: buildPerms(Object.fromEntries(ALL_PERM_KEYS.map(k => [k, true]))),
  },
  {
    id: "role_manager", name: "Manager", builtIn: true, color: "primary",
    description: "Full operational access with limited admin",
    permissions: buildPerms({
      view_dashboard:true,view_calendar:true,view_clients:true,view_client_detail:true,view_dog_detail:true,
      view_crm:true,view_messages:true,view_payments:true,view_daily_ops:true,view_eod:true,view_ai:true,view_settings:true,
      create_client:true,edit_client:true,edit_lifecycle_banners:true,create_dog:true,edit_dog:true,edit_vaccines:true,edit_feeding:true,edit_medications:true,edit_dog_tags:true,
      create_reservation:true,check_in:true,check_out:true,cancel_reservation:true,
      view_payment_history:true,collect_payment:true,issue_refund:true,
      edit_daily_ops:true,lock_daily_ops:true,edit_eod:true,lock_eod:true,
      edit_tours:true,edit_evaluations:true,
      view_management:true,edit_attendance:true,edit_roster:true,view_audit_log:true,
      view_message_threads:true,send_messages:true,
      edit_pricing:true,edit_fields:true,edit_tags_config:true,edit_vaccines_config:true,edit_agreements:true,
      edit_eod_template:true,edit_ops_template:true,edit_dropdowns:true,use_ai:true,
      override_closed_dates:true,
      manage_team:false,manage_roles:false,edit_facility:false,edit_rooms:false,reset_data:false,use_time_travel:false,
    }),
  },
  {
    id: "role_enterprise_admin", name: "Enterprise Admin", builtIn: true, color: "accent",
    description: "Full access to all locations and enterprise features",
    permissions: buildPerms(Object.fromEntries(ALL_PERM_KEYS.map(k => [k, true]))),
  },
  {
    id: "role_staff", name: "Front Desk", builtIn: true, color: "default",
    description: "Customer-facing operations and basic tasks",
    permissions: buildPerms({
      view_dashboard:true,view_calendar:true,view_clients:true,view_client_detail:true,view_dog_detail:true,
      view_messages:true,view_payments:true,
      create_client:true,edit_client:true,create_dog:true,
      create_reservation:true,check_in:true,check_out:true,
      view_payment_history:true,collect_payment:true,
      view_message_threads:true,send_messages:true,
    }),
  },
];

export { PERMISSION_CATEGORIES, ALL_PERM_KEYS, buildPerms, DEFAULT_ROLES };
