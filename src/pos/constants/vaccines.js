// Vaccine configuration
const VACCINES = [
  { id: "rabies_exp", name: "Rabies", requiredByDefault: true },
  { id: "dhpp_exp", name: "Distemper (DHPP)", requiredByDefault: true },
  { id: "bordetella_exp", name: "Bordetella", requiredByDefault: true },
  { id: "canine_flu_exp", name: "Canine Influenza", requiredByDefault: false },
];
const DEF_REQUIRED_VACCINES = VACCINES.filter(v => v.requiredByDefault).map(v => v.id);

export { VACCINES, DEF_REQUIRED_VACCINES };
