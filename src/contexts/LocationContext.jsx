// K9 Operations — Location Context
// Provides current active location across the app.
// Fetches user's location from profile, stores in context + localStorage.
// Architecture supports multiple locations per user (future: junction table).

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../AuthProvider";

const LocationContext = createContext({});

export const useLocation = () => useContext(LocationContext);

// localStorage key for persisted location
const LS_KEY = "k9_active_location";

/**
 * LocationProvider
 *
 * Wraps the app to provide location context. On mount:
 * 1. Checks localStorage for a previously selected location
 * 2. Falls back to the user's profile location_id
 * 3. Fetches available locations from lite_settings (gingr_config entries)
 *
 * Exports via useLocation():
 *   locationId         — current active location slug (TEXT, e.g. 'your-gingr-subdomain')
 *   locationName       — display name for current location
 *   setLocation(id)    — switch active location
 *   availableLocations — [{ id, name, slug }] for multi-location users
 *   isLoading          — true while resolving initial location
 *   gingrConfig        — { api_key, subdomain, location_id } for current location
 */
export function LocationProvider({ children }) {
  const { profile, loading: authLoading } = useAuth();
  const [locationId, setLocationId] = useState(() => {
    try { return localStorage.getItem(LS_KEY) || null; } catch { return null; }
  });
  const [availableLocations, setAvailableLocations] = useState([]);
  const [gingrConfig, setGingrConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch available locations from lite_settings gingr_config entries
  useEffect(() => {
    if (authLoading) return;

    async function loadLocations() {
      try {
        // Get all gingr_config entries — each represents a location
        const { data: configs } = await supabase
          .from("lite_settings")
          .select("location_id, setting_value")
          .eq("setting_key", "gingr_config");

        const locs = (configs || [])
          .filter(c => c.setting_value?.subdomain)
          .map(c => ({
            id: c.location_id,
            name: formatLocationName(c.location_id),
            slug: c.location_id,
            gingrConfig: c.setting_value,
          }));

        setAvailableLocations(locs);

        // Resolve active location
        const profileLoc = profile?.location_id || null;
        const stored = (() => { try { return localStorage.getItem(LS_KEY); } catch { return null; } })();

        // Priority: stored > profile > first available
        let active = null;
        if (stored && locs.some(l => l.id === stored)) {
          active = stored;
        } else if (profileLoc && locs.some(l => l.id === profileLoc)) {
          active = profileLoc;
        } else if (locs.length > 0) {
          active = locs[0].id;
        }

        if (active) {
          setLocationId(active);
          try { localStorage.setItem(LS_KEY, active); } catch {}
          // Set gingr config for active location
          const loc = locs.find(l => l.id === active);
          if (loc?.gingrConfig) setGingrConfig(loc.gingrConfig);
        }
      } catch (err) {
        console.error("Failed to load locations:", err);
        // Fallback to profile location
        if (profile?.location_id) {
          setLocationId(profile.location_id);
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadLocations();
  }, [authLoading, profile?.location_id]);

  // Switch location
  const setLocation = useCallback((newLocationId) => {
    setLocationId(newLocationId);
    try { localStorage.setItem(LS_KEY, newLocationId); } catch {}

    // Update gingr config
    const loc = availableLocations.find(l => l.id === newLocationId);
    if (loc?.gingrConfig) {
      setGingrConfig(loc.gingrConfig);
    } else {
      setGingrConfig(null);
    }
  }, [availableLocations]);

  // Current location name
  const locationName = useMemo(() => {
    const loc = availableLocations.find(l => l.id === locationId);
    return loc?.name || formatLocationName(locationId) || "Unknown Location";
  }, [locationId, availableLocations]);

  const value = useMemo(() => ({
    locationId,
    locationName,
    setLocation,
    availableLocations,
    isLoading,
    gingrConfig,
  }), [locationId, locationName, setLocation, availableLocations, isLoading, gingrConfig]);

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

// Convert location slug to display name (e.g. 'your-gingr-subdomain' → 'Adair Forsythe')
function formatLocationName(slug) {
  if (!slug) return "";
  // Remove 'k9' prefix and split camelCase/concatenated words
  let name = slug.replace(/^k9/i, "");
  // Insert spaces before capitals or between known words
  name = name.replace(/([a-z])([A-Z])/g, "$1 $2");
  // Capitalize first letter of each word
  return name.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
