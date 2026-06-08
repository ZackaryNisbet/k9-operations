const GOOGLE_PLACES_API_KEY = import.meta.env?.VITE_GOOGLE_PLACES_API_KEY || "";
let googlePlacesScriptPromise = null;

function loadGooglePlacesScript() {
  if (typeof document === "undefined") return Promise.resolve(false);
  if (window.google?.maps?.places) return Promise.resolve(true);
  if (!GOOGLE_PLACES_API_KEY) return Promise.resolve(false);
  if (googlePlacesScriptPromise) return googlePlacesScriptPromise;
  googlePlacesScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-k9-resort-upkeep-google-places]");
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_PLACES_API_KEY)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.k9ResortUpkeepGooglePlaces = "true";
    script.onload = () => resolve(true);
    script.onerror = reject;
    document.head.appendChild(script);
  }).catch(() => false);
  return googlePlacesScriptPromise;
}

export async function searchGoogleVendors(query) {
  const ready = await loadGooglePlacesScript();
  if (!ready || !window.google?.maps?.places?.AutocompleteService) return [];
  const service = new window.google.maps.places.AutocompleteService();
  return new Promise((resolve) => {
    service.getPlacePredictions({ input: query, types: ["establishment"] }, (predictions, status) => {
      if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions) {
        resolve([]);
        return;
      }
      resolve(predictions.slice(0, 5));
    });
  });
}

export async function getGoogleVendorDetails(placeId) {
  const ready = await loadGooglePlacesScript();
  if (!ready || !window.google?.maps?.places?.PlacesService || !placeId) return null;
  const div = document.createElement("div");
  const service = new window.google.maps.places.PlacesService(div);
  return new Promise((resolve) => {
    service.getDetails(
      { placeId, fields: ["place_id", "name", "formatted_address", "address_components", "website"] },
      (place, status) => resolve(status === window.google.maps.places.PlacesServiceStatus.OK ? place : null),
    );
  });
}

export function parsePlaceAddress(place) {
  const components = place?.address_components || [];
  const byType = (type) => components.find((item) => item.types?.includes(type));
  const streetNumber = byType("street_number")?.long_name || "";
  const route = byType("route")?.long_name || "";
  const city = byType("locality")?.long_name || byType("postal_town")?.long_name || byType("sublocality")?.long_name || "";
  const state = byType("administrative_area_level_1")?.short_name || "";
  const zip = byType("postal_code")?.long_name || "";
  const country = byType("country")?.short_name || "US";
  const line1 = [streetNumber, route].filter(Boolean).join(" ").trim();
  return {
    business_address: place?.formatted_address || line1,
    address_line_1: line1,
    address_city: city,
    address_state: state,
    address_postal_code: zip,
    address_country: country,
    google_place_id: place?.place_id || "",
  };
}
