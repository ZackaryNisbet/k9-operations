// Google Places address/business autocomplete, reusable on its own. Type a
// business or address → pick a suggestion → onSelect fires with the parsed split
// address (+ name / phone / website / place id). Degrades to a plain text input
// when no API key is configured. Reuses the grassroots address parsers so the
// directory and the marketing tracker interpret Places results identically.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { C } from "../shared/theme";
import { parseGooglePlaceAddress, extractGooglePlaceBusinessName } from "./grassrootsAddress";

const GOOGLE_PLACES_API_KEY = import.meta.env?.VITE_GOOGLE_PLACES_API_KEY || "";
let placesScriptPromise = null;

function loadGooglePlacesScript() {
  if (typeof document === "undefined") return Promise.resolve(false);
  if (window.google?.maps?.places) return Promise.resolve(true);
  if (!GOOGLE_PLACES_API_KEY) return Promise.resolve(false);
  if (placesScriptPromise) return placesScriptPromise;
  placesScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-k9-google-places]");
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_PLACES_API_KEY)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.k9GooglePlaces = "true";
    script.onload = () => resolve(true);
    script.onerror = reject;
    document.head.appendChild(script);
  }).catch((error) => {
    console.warn("Google Places autocomplete unavailable", error);
    return false;
  });
  return placesScriptPromise;
}

const LABEL_STYLE = { display: "block", fontSize: 11, fontWeight: 700, color: C.textSec, marginBottom: 4, letterSpacing: "0.03em", textTransform: "uppercase" };
const INPUT_STYLE = { width: "100%", padding: "10px 14px", border: `1.5px solid ${C.border}`, borderRadius: 12, fontSize: 14, fontFamily: "inherit", color: C.text, background: C.surface, outline: "none", boxSizing: "border-box" };

export default function PlacesAddressInput({ label, value, onChange, onSelect, placeholder = "Start typing an address or business" }) {
  const wrapRef = useRef(null);
  const autocompleteRef = useRef(null);
  const detailsRef = useRef(null);
  const tokenRef = useRef(null);
  const requestIdRef = useRef(0);
  const selectedRef = useRef("");
  const [ready, setReady] = useState(false);
  const [predictions, setPredictions] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const newToken = useCallback(() => {
    if (window.google?.maps?.places?.AutocompleteSessionToken) {
      tokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadGooglePlacesScript().then((ok) => {
      if (cancelled || !ok || !window.google?.maps?.places) return;
      autocompleteRef.current = new window.google.maps.places.AutocompleteService();
      detailsRef.current = new window.google.maps.places.PlacesService(document.createElement("div"));
      newToken();
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [newToken]);

  useEffect(() => {
    const handler = (event) => { if (!wrapRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const query = String(value || "").trim();
    if (!ready || query.length < 3 || query === selectedRef.current) {
      setPredictions([]);
      return undefined;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const timer = window.setTimeout(() => {
      autocompleteRef.current?.getPlacePredictions({
        input: query,
        types: ["establishment"],
        componentRestrictions: { country: "us" },
        sessionToken: tokenRef.current,
      }, (results = [], status) => {
        if (requestIdRef.current !== requestId) return;
        const okStatus = window.google?.maps?.places?.PlacesServiceStatus?.OK;
        const next = status === okStatus ? results.slice(0, 6) : [];
        setPredictions(next);
        setActiveIndex(next.length ? 0 : -1);
        setOpen(next.length > 0);
      });
    }, 160);
    return () => window.clearTimeout(timer);
  }, [ready, value]);

  const applyPlace = useCallback((place, fallbackName = "") => {
    const parsed = parseGooglePlaceAddress(place);
    const name = extractGooglePlaceBusinessName(place, fallbackName);
    selectedRef.current = parsed.address_line_1 || place?.formatted_address || name;
    onSelect?.({
      ...parsed,
      address: parsed.address || place?.formatted_address || "",
      name,
      google_place_id: place?.place_id || parsed.google_place_id || "",
      phone: place?.formatted_phone_number || "",
      website: place?.website || "",
    });
    setPredictions([]);
    setOpen(false);
    setActiveIndex(-1);
    newToken();
  }, [onSelect, newToken]);

  const selectPrediction = useCallback((prediction) => {
    if (!prediction?.place_id || !detailsRef.current) return;
    const fallbackName = prediction.structured_formatting?.main_text || prediction.description || "";
    detailsRef.current.getDetails({
      placeId: prediction.place_id,
      fields: ["address_components", "formatted_address", "formatted_phone_number", "name", "place_id", "types", "website"],
      sessionToken: tokenRef.current,
    }, (place, status) => {
      const okStatus = window.google?.maps?.places?.PlacesServiceStatus?.OK;
      if (status === okStatus && place) applyPlace(place, fallbackName);
      else applyPlace({ formatted_address: "", name: fallbackName, place_id: prediction.place_id }, fallbackName);
    });
  }, [applyPlace]);

  const handleKeyDown = (event) => {
    if (!open || predictions.length === 0) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((i) => (i + 1) % predictions.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((i) => (i <= 0 ? predictions.length - 1 : i - 1)); }
    else if (event.key === "Enter" && activeIndex >= 0) { event.preventDefault(); selectPrediction(predictions[activeIndex]); }
    else if (event.key === "Escape") { setOpen(false); }
  };

  return (
    <label style={{ display: "block", position: "relative" }} ref={wrapRef}>
      {label ? <span style={LABEL_STYLE}>{label}</span> : null}
      <input
        value={value || ""}
        onChange={(event) => { selectedRef.current = ""; onChange(event.target.value); }}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (predictions.length) setOpen(true); }}
        placeholder={placeholder}
        autoComplete="off"
        data-1p-ignore="true"
        data-lpignore="true"
        style={INPUT_STYLE}
      />
      {open && predictions.length > 0 ? (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 120, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(15,23,42,0.14)", marginTop: 4, overflow: "hidden" }}>
          {predictions.map((prediction, i) => (
            <div
              key={prediction.place_id}
              onMouseDown={(event) => { event.preventDefault(); selectPrediction(prediction); }}
              onMouseEnter={() => setActiveIndex(i)}
              style={{ padding: "9px 12px", cursor: "pointer", background: i === activeIndex ? C.surfaceHover : "transparent", borderBottom: i < predictions.length - 1 ? `1px solid ${C.borderLight}` : "none" }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{prediction.structured_formatting?.main_text || prediction.description}</div>
              {prediction.structured_formatting?.secondary_text ? (
                <div style={{ fontSize: 11, color: C.textMut, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{prediction.structured_formatting.secondary_text}</div>
              ) : null}
            </div>
          ))}
          <div style={{ padding: "4px 12px", fontSize: 10, color: "#9CA3AF", background: C.surfaceHover, textAlign: "right" }}>Google Places</div>
        </div>
      ) : null}
    </label>
  );
}
