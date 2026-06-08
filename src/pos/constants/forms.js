// Default agreements
const DEF_AGREEMENTS = [
  { id: "agr1", name: "Customer Agreement", required: true, order: 0, body: "CUSTOMER AGREEMENT — K9 OPERATIONS\n\nBy signing this agreement, the pet owner (\"Owner\") acknowledges and agrees to the following terms and conditions for all services provided by K9 Operations (\"Facility\"):\n\n1. SERVICES\nThe Facility agrees to provide boarding, daycare, and/or ancillary services for the pet(s) identified in the Owner's registration. Services include supervised group or individual play, feeding per Owner instructions, overnight accommodations (boarding only), and basic daily care.\n\n2. HEALTH & VACCINATION REQUIREMENTS\nOwner certifies that pet(s) are current on all required vaccinations including Rabies, DHPP, Bordetella, and Canine Influenza. Owner agrees to provide proof of vaccination prior to the first visit. Pets not current on vaccinations will not be admitted.\n\n3. TEMPERAMENT & BEHAVIOR\nOwner certifies that pet(s) have not harmed or shown aggressive behavior toward any person or other animal. The Facility reserves the right to refuse service or terminate care at any time if a pet exhibits aggressive or dangerous behavior.\n\n4. ASSUMPTION OF RISK\nOwner understands that during group play and socialization, minor scrapes, nicks, or injuries may occur. Owner accepts these inherent risks associated with group play environments.\n\n5. EMERGENCY CARE\nIn the event of illness or injury, the Facility will attempt to contact the Owner immediately. If the Owner cannot be reached, the Facility is authorized to seek veterinary care at the Owner's expense.\n\n6. RELEASE OF LIABILITY\nOwner releases K9 Operations, its owners, employees, and agents from any and all liability, claims, demands, or causes of action arising from or related to any injury, illness, or death of pet(s) while in the care of the Facility, except in cases of gross negligence. Owner agrees to indemnify and hold harmless the Facility from any claims, damages, or expenses arising from pet's behavior.\n\n7. PERSONAL PROPERTY\nThe Facility is not responsible for loss or damage to any personal items (collars, leashes, toys, bedding) left with pet(s).\n\n8. PHOTO/VIDEO CONSENT\nOwner grants the Facility permission to photograph or video pet(s) for use on social media, marketing materials, or internal records.\n\n9. PAYMENT\nOwner agrees to pay all fees for services rendered. Payment is due at the time of checkout. A deposit may be required for boarding reservations.\n\n10. ACKNOWLEDGMENT\nI have read this agreement in its entirety, understand its terms, and agree to be bound by it.\n\nOwner Signature: ___________________________  Date: __________\nPrinted Name: ___________________________", updatedAt: null },
];

// Default questionnaire template — "Getting to Know Your Dog"
const DEF_QUESTIONNAIRE = {
  id: "gtky_default",
  name: "Getting to Know Your Dog",
  clientSections: [
    {
      id: "owner_info",
      title: "Owner Information",
      oncePerClient: true,
      fields: [
        { id: "owner_name", label: "Owner Name", type: "text", required: true },
        { id: "emergency_contact_name", label: "Emergency Contact Name", type: "text", required: true },
        { id: "emergency_contact_phone", label: "Emergency Contact Phone", type: "phone", required: true },
      ],
    },
  ],
  dogSections: [
    {
      id: "basic_info",
      title: "Dog Information",
      fields: [
        { id: "dog_name", label: "Dog's Name", type: "text", required: true },
        { id: "age", label: "Age", type: "text", required: true },
        { id: "breed", label: "Breed", type: "text", required: true },
        { id: "how_long_owned", label: "How long have you owned your dog?", type: "text", required: false },
        { id: "origin", label: "Where did you get your dog?", type: "select", options: ["Breeder", "Rescue/Shelter", "Rehomed", "Other"], required: false },
        { id: "why_daycare", label: "Why are you interested in daycare for your dog?", type: "multiselect", options: ["Socialization", "Exercise / Energy", "Separation anxiety concerns", "Trainer recommendation", "Vet recommendation", "Other"], required: false },
      ],
    },
    {
      id: "socialization",
      title: "Socialization & Interaction",
      fields: [
        { id: "interaction_level", label: "What level of interaction has your dog had with other dogs?", type: "select", options: ["None", "Minimal (walks only)", "Moderate (occasional playdates)", "Extensive (dog parks, daycare)"], required: true },
        { id: "incident_history", label: "Has there been any incidents during off-leash interaction?", type: "radio", options: ["Yes", "No"], required: true },
        { id: "incident_details", label: "If yes, please describe", type: "textarea", required: false, showIf: { field: "incident_history", value: "Yes" } },
        { id: "dismissed_from_facility", label: "Has your dog been asked to leave or dismissed from any facility?", type: "radio", options: ["Yes", "No"], required: true },
        { id: "dismissed_details", label: "If yes, please describe", type: "textarea", required: false, showIf: { field: "dismissed_from_facility", value: "Yes" } },
        { id: "injuries", label: "Has your dog been injured during off-leash interaction?", type: "radio", options: ["Yes", "No"], required: false },
        { id: "injury_details", label: "If yes, please describe", type: "textarea", required: false, showIf: { field: "injuries", value: "Yes" } },
      ],
    },
    {
      id: "health",
      title: "Health & Physical",
      fields: [
        { id: "disabilities", label: "Does your dog have any physical disabilities or medical conditions?", type: "radio", options: ["Yes", "No"], required: true },
        { id: "disability_details", label: "If yes, please describe", type: "textarea", required: false, showIf: { field: "disabilities", value: "Yes" } },
        { id: "spayed_neutered", label: "Is your dog spayed/neutered?", type: "radio", options: ["Yes", "No"], required: true },
      ],
    },
    {
      id: "behavior",
      title: "Behavior & Activity",
      fields: [
        { id: "activity_level", label: "Activity level", type: "select", options: ["Couch Potato", "Moderate", "Active", "Athlete"], required: true },
        { id: "walk_frequency", label: "How often does your dog get walked?", type: "select", options: ["Rarely", "1-2x/week", "3-5x/week", "Daily", "Multiple times daily"], required: false },
        { id: "reaction_strangers", label: "How does your dog react to strangers?", type: "select", options: ["Friendly/approaches", "Cautious/shy", "Indifferent", "Fearful", "Aggressive/reactive"], required: true },
        { id: "reaction_dogs_leash", label: "How does your dog react to other dogs on-leash?", type: "select", options: ["Friendly/playful", "Cautious/shy", "Indifferent", "Reactive/lunging", "Aggressive"], required: true },
        { id: "reaction_dogs_offleash", label: "How does your dog react to other dogs off-leash?", type: "select", options: ["Friendly/playful", "Cautious/shy", "Indifferent", "Reactive", "Aggressive"], required: true },
        { id: "snapping_history", label: "Has your dog ever snapped at or bitten a person or dog?", type: "radio", options: ["Yes", "No"], required: true },
        { id: "snapping_details", label: "If yes, please describe", type: "textarea", required: false, showIf: { field: "snapping_history", value: "Yes" } },
        { id: "food_guarding", label: "Does your dog guard food or toys?", type: "radio", options: ["Yes", "No"], required: false },
      ],
    },
    {
      id: "training",
      title: "Training & Commands",
      fields: [
        { id: "training_history", label: "Training history", type: "multiselect", options: ["Formal group classes", "Private trainer", "At-home self-trained", "Board & train program", "None"], required: false },
        { id: "commands_known", label: "Commands your dog knows", type: "multiselect", options: ["Sit", "Stay", "Down", "Come", "Heel", "Leave it", "Drop it", "Off", "Place", "None"], required: false },
        { id: "energy_level", label: "Energy level during play", type: "select", options: ["Low — prefers to observe", "Medium — plays then rests", "High — non-stop player", "Varies"], required: false },
      ],
    },
    {
      id: "fears",
      title: "Fears & Sensitivities",
      fields: [
        { id: "fear_people", label: "Is your dog afraid of certain types of people?", type: "radio", options: ["Yes", "No"], required: false },
        { id: "fear_people_details", label: "If yes, please describe", type: "textarea", required: false, showIf: { field: "fear_people", value: "Yes" } },
        { id: "weather_fears", label: "Does your dog have weather-related fears?", type: "multiselect", options: ["Rain", "Thunder/lightning", "Fireworks", "None"], required: false },
      ],
    },
    {
      id: "acknowledgment",
      title: "Acknowledgment",
      fields: [
        { id: "minor_injury_ack", label: "I understand that minor scrapes, nicks, or injuries are common during group play and are part of normal dog socialization", type: "checkbox", required: true },
        { id: "disease_risk_ack", label: "I understand that kennel cough, canine influenza, and other contagious diseases can be contracted in group settings despite preventive measures", type: "checkbox", required: true },
        { id: "vet_bill_ack", label: "I understand that I am responsible for any vet bills resulting from injuries to my dog during group play", type: "checkbox", required: true },
        { id: "additional_notes", label: "Anything else you would like us to know about your dog?", type: "textarea", required: false },
      ],
    },
  ],
};

// Default dog tag definitions
const DEF_DOG_TAGS = [
  { id: "tag_eval", name: "Evaluation", colorIdx: 2 },
  { id: "tag_lp", name: "Large Playgroup", colorIdx: 1 },
  { id: "tag_sp", name: "Small Playgroup", colorIdx: 0 },
  { id: "tag_pp", name: "Private Play", colorIdx: 3 },
];
const CLASSIFICATION_TAG_IDS = ["tag_lp", "tag_sp", "tag_pp"];

// Room types for boarding
const ROOM_TYPES = ["Luxury Suite","Executive Room","Double Compartment","Single Compartment"];

// Evaluation outcomes
const EVAL_RESULTS = ["pending","passed_group","passed_private"];

// ─── Default Hotkey Bindings ─────────────────────────────────────────────────
const DEF_HOTKEY_BINDINGS = {
  dashboard: "d", lodging: "l", clients: "c",
  newReservation: "n", settings: "s", ai: "a", quickDaycare: "q", search: "/",
};
const HOTKEY_LABELS = {
  dashboard: "Dashboard", lodging: "Lodging Calendar", clients: "Clients",
  newReservation: "New Reservation", settings: "Settings", ai: "AI Command", quickDaycare: "Quick Check-In", search: "Search",
};

export { DEF_AGREEMENTS, DEF_QUESTIONNAIRE, DEF_DOG_TAGS, CLASSIFICATION_TAG_IDS, ROOM_TYPES, EVAL_RESULTS, DEF_HOTKEY_BINDINGS, HOTKEY_LABELS };
