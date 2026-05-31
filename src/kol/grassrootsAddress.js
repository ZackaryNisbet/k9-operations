// Pure address / Google Places / clipboard helpers for the Grassroots tracker.
// Extracted from GrassrootsPage.jsx so that file exports only its React component —
// which lets React Fast Refresh hot-update it (a module that mixes component and
// non-component exports forces a full reload). No React/JSX here.

export function parseFreeformGrassrootsAddress(value) {
  const address = String(value || "").trim().replace(/\s+/g, " ");
  const blank = {
    address,
    address_line_1: "",
    address_line_2: "",
    address_city: "",
    address_state: "",
    address_postal_code: "",
    address_country: "",
    google_place_id: "",
  };
  if (!address) return blank;

  // First try the structured comma split
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  let postalCode = "";
  let state = "";
  let city = "";
  let line1 = "";

  if (parts.length >= 3) {
    const countryRaw = parts.at(-1) || "";
    const country = /^u\.?s\.?a?\.?$/i.test(countryRaw) || /^united states/i.test(countryRaw) ? "US" : countryRaw;
    const statePostal = parts.at(-2) || "";
    const statePostalMatch = statePostal.match(/^([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/i);
    const postalOnlyMatch = statePostal.match(/(\d{5}(?:-\d{4})?)$/);
    state = statePostalMatch?.[1]?.toUpperCase() || "";
    postalCode = statePostalMatch?.[2] || postalOnlyMatch?.[1] || "";
    city = parts.at(-3) || "";
    line1 = parts.slice(0, -3).join(", ");

    if (postalCode) {
      return {
        ...blank,
        address_line_1: line1,
        address_city: city,
        address_state: state,
        address_postal_code: postalCode,
        address_country: country,
      };
    }
  }

  // Aggressive fallback: hunt for any 5-digit ZIP anywhere in the string
  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipMatch) {
    postalCode = zipMatch[1];
  }

  // Try to extract state if still missing
  if (!state) {
    const stateMatch = address.match(/\b([A-Z]{2})\b/);
    if (stateMatch) state = stateMatch[1];
  }

  return {
    ...blank,
    address_line_1: line1 || address,
    address_city: city,
    address_state: state,
    address_postal_code: postalCode,
    address_country: "US",
  };
}

export function parseGooglePlaceAddress(place) {
  // Legacy Autocomplete shape
  if (place?.address_components) {
    const components = Array.isArray(place.address_components) ? place.address_components : [];
    const read = (type, mode = "long_name") => components.find((component) => component.types?.includes(type))?.[mode] || "";
    const streetNumber = read("street_number");
    const route = read("route");
    const postalCode = [read("postal_code"), read("postal_code_suffix")].filter(Boolean).join("-");
    const fallback = parseFreeformGrassrootsAddress(place?.formatted_address || "");
    return {
      address: place?.formatted_address || fallback.address || "",
      address_line_1: [streetNumber, route].filter(Boolean).join(" ").trim() || fallback.address_line_1,
      address_line_2: "",
      address_city: read("locality") || read("postal_town") || read("sublocality") || read("administrative_area_level_3") || fallback.address_city,
      address_state: read("administrative_area_level_1", "short_name") || fallback.address_state,
      address_postal_code: postalCode || fallback.address_postal_code,
      address_country: read("country", "short_name") || fallback.address_country,
      google_place_id: place?.place_id || "",
    };
  }

  // New Places Library shape (addressComponents as array of objects with longText/shortText)
  if (place?.addressComponents) {
    const components = place.addressComponents;
    const find = (type) => components.find((c) => c.types?.includes(type));

    const streetNumber = find("street_number")?.longText || "";
    const route = find("route")?.longText || "";
    const postal = find("postal_code")?.longText || "";
    const postalSuffix = find("postal_code_suffix")?.longText || "";
    const postalCode = [postal, postalSuffix].filter(Boolean).join("-");

    const city = find("locality")?.longText ||
                 find("postal_town")?.longText ||
                 find("sublocality")?.longText ||
                 find("administrative_area_level_3")?.longText || "";

    const state = find("administrative_area_level_1")?.shortText || "";
    const country = find("country")?.shortText || "";

    const line1 = [streetNumber, route].filter(Boolean).join(" ").trim();

    return {
      address: place.formattedAddress || "",
      address_line_1: line1,
      address_line_2: "",
      address_city: city,
      address_state: state,
      address_postal_code: postalCode,
      address_country: country,
      google_place_id: place.id || "",
    };
  }

  // Fallback: no structured components, but still carry the place id through if
  // one was supplied (place_id from the legacy API, id from the new Places lib).
  const fallback = parseFreeformGrassrootsAddress(place?.formattedAddress || place?.formatted_address || "");
  return { ...fallback, google_place_id: place?.place_id || place?.id || fallback.google_place_id || "" };
}

function looksLikeGoogleAddressTail(value) {
  return /(?:\b[A-Z]{2}\b|\d{5}|usa|united states|new jersey|pennsylvania|delaware|route|rte|road|rd|street|st|avenue|ave|boulevard|blvd|drive|dr|lane|ln|highway|hwy|pike|turnpike)/i.test(String(value || ""));
}

export function cleanGooglePlaceBusinessLabel(value, options = {}) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  const segments = normalized.split(",").map((part) => part.trim()).filter(Boolean);
  if (segments.length > 1 && (!options.preserveBusinessCommas || looksLikeGoogleAddressTail(segments.slice(1).join(", ")))) {
    return segments[0];
  }
  return normalized;
}

export function extractGooglePlaceBusinessName(place, fallbackValue = "") {
  return cleanGooglePlaceBusinessLabel(place?.name, { preserveBusinessCommas: true }) || cleanGooglePlaceBusinessLabel(fallbackValue);
}

function googlePlaceTextIncludes(text, terms) {
  return terms.some((term) => text.includes(term));
}

export function inferGrassrootsBusinessCategoryFromPlace(place = {}, businessName = "") {
  const types = Array.isArray(place?.types) ? place.types.map((type) => String(type || "").toLowerCase()) : [];
  const name = String(businessName || place?.name || "").toLowerCase();
  const text = [name, ...types, place?.formatted_address].filter(Boolean).join(" ").toLowerCase();

  if (types.includes("veterinary_care") || googlePlaceTextIncludes(text, [
    "animal hospital",
    "banfield",
    "pet hospital",
    "vca ",
    "vet ",
    "veterinarian",
    "veterinary",
  ])) {
    return "Veterinarian";
  }
  if (googlePlaceTextIncludes(text, ["groom", "groomer", "grooming", "pet spa"])) return "Groomer";
  if (types.includes("pet_store") || googlePlaceTextIncludes(text, [
    "pet store",
    "pet supplies",
    "pet supermarket",
    "petco",
    "petsmart",
    "pet valu",
  ])) {
    return "Pet Retailer";
  }
  if (googlePlaceTextIncludes(text, [
    "animal rescue",
    "animal shelter",
    "humane society",
    "rescue",
    "shelter",
    "spca",
  ])) {
    return "Rescue";
  }
  if (googlePlaceTextIncludes(text, ["dog training", "obedience", "trainer", "training"])) return "Trainer";
  if (googlePlaceTextIncludes(text, [
    "boarding",
    "camp bow wow",
    "daycare",
    "dog camp",
    "dog hotel",
    "kennel",
    "pet lodge",
    "pet resort",
  ])) {
    return "Boarding/Daycare";
  }
  return "";
}

export function buildGrassrootsLegacyAddressFromSplitAddress(source = {}) {
  const line1 = String(source.address_line_1 || "").trim();
  const line2 = String(source.address_line_2 || "").trim();
  const city = String(source.address_city || "").trim();
  const state = String(source.address_state || "").trim();
  const postalCode = String(source.address_postal_code || "").trim();
  const country = String(source.address_country || "").trim();
  const cityStatePostal = [
    city,
    [state, postalCode].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
  return [line1, line2, cityStatePostal, country].filter(Boolean).join(", ");
}

export function getGrassrootsVisibleAddressLine(source = {}) {
  return String(source.address_line_1 || source.address || "").trim();
}

export async function copyGrassrootsTextToClipboard(value, sourceInput = null, runtime = {}) {
  const text = String(value || "");
  if (!text) return { copied: false, verified: false };
  const runtimeDocument = runtime.document ?? (typeof document !== "undefined" ? document : null);
  const runtimeNavigator = runtime.navigator ?? (typeof navigator !== "undefined" ? navigator : null);
  const selectSourceInput = () => {
    if (!sourceInput) return false;
    try {
      sourceInput.focus({ preventScroll: true });
      sourceInput.select();
      sourceInput.setSelectionRange(0, text.length);
      return true;
    } catch {
      return false;
    }
  };
  const sourceSelected = selectSourceInput();

  let selectionCopied = false;
  if (sourceSelected && runtimeDocument) {
    try {
      selectionCopied = runtimeDocument.execCommand?.("copy") === true;
    } catch {
      selectionCopied = false;
    }
  } else if (runtimeDocument) {
    const textarea = runtimeDocument.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.width = "1px";
    textarea.style.height = "1px";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    runtimeDocument.body.appendChild(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    try {
      selectionCopied = runtimeDocument.execCommand?.("copy") === true;
    } catch {
      selectionCopied = false;
    }
    runtimeDocument.body.removeChild(textarea);
  }

  let apiCopied = false;
  let verified = false;
  if (runtimeNavigator?.clipboard?.writeText) {
    try {
      await runtimeNavigator.clipboard.writeText(text);
      apiCopied = true;
    } catch {
      apiCopied = false;
    }
  }
  if (runtimeNavigator?.clipboard?.readText) {
    try {
      verified = (await runtimeNavigator.clipboard.readText()) === text;
    } catch {
      verified = false;
    }
  }
  if (!selectionCopied) selectSourceInput();
  return { copied: selectionCopied, verified, apiCopied, selectionCopied, sourceSelected };
}
