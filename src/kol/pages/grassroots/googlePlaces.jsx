import React from "react";

const GOOGLE_PLACES_API_KEY = import.meta.env?.VITE_GOOGLE_PLACES_API_KEY || "";
let googlePlacesScriptPromise = null;

export function loadGooglePlacesScript() {
  if (typeof document === "undefined") return Promise.resolve(false);
  if (window.google?.maps?.places) return Promise.resolve(true);
  if (!GOOGLE_PLACES_API_KEY) return Promise.resolve(false);
  if (googlePlacesScriptPromise) return googlePlacesScriptPromise;
  googlePlacesScriptPromise = new Promise((resolve, reject) => {
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
  return googlePlacesScriptPromise;
}

export function getGooglePredictionSecondaryText(prediction) {
  const structured = prediction?.structured_formatting || {};
  const mainText = String(structured.main_text || "").trim();
  const secondaryText = String(structured.secondary_text || "").trim();
  if (secondaryText) return secondaryText;
  const description = String(prediction?.description || "").trim();
  if (!description || !mainText) return description;
  return description.replace(new RegExp(`^${mainText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*,\\s*`, "i"), "");
}

export function renderGooglePredictionText(text, matchedSubstrings = []) {
  const source = String(text || "");
  if (!source) return null;
  const ranges = matchedSubstrings
    .map((range) => ({
      start: Number(range?.offset || 0),
      end: Number(range?.offset || 0) + Number(range?.length || 0),
    }))
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start);
  if (ranges.length === 0) return source;
  const parts = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    const start = Math.max(cursor, Math.min(source.length, range.start));
    const end = Math.max(start, Math.min(source.length, range.end));
    if (start > cursor) parts.push(source.slice(cursor, start));
    if (end > start) {
      parts.push(<mark key={`match-${index}`}>{source.slice(start, end)}</mark>);
    }
    cursor = end;
  });
  if (cursor < source.length) parts.push(source.slice(cursor));
  return parts;
}
