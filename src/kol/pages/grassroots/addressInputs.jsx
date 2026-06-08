import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { C } from "../../../shared/theme";
import { I } from "../../../shared/icons";
import {
  parseGooglePlaceAddress,
  extractGooglePlaceBusinessName,
  inferGrassrootsBusinessCategoryFromPlace,
  buildGrassrootsLegacyAddressFromSplitAddress,
  getGrassrootsVisibleAddressLine,
  copyGrassrootsTextToClipboard,
  cleanGooglePlaceBusinessLabel,
} from "../../grassrootsAddress";
import { INPUT_STYLE, Label } from "./primitives";
import {
  loadGooglePlacesScript,
  getGooglePredictionSecondaryText,
  renderGooglePredictionText,
} from "./googlePlaces";
import { FieldEditor } from "./formControls";

export function GooglePlacesAddressInput({ label = "Address", value, onChange, onPlaceSelect, placeholder = "Start typing an address" }) {
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);

  const fetchSuggestions = async (inputValue) => {
    const q = (inputValue || "").trim();
    if (!q || q.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    try {
      const ready = await loadGooglePlacesScript();
      const hasNewAPI = !!(window.google?.maps?.places?.AutocompleteSuggestion);
      if (!ready || !hasNewAPI) {
        setSuggestions([]);
        setIsOpen(false);
        return;
      }

      const request = {
        input: q,
        locationBias: { center: { lat: 39.9, lng: -74.95 }, radius: 50000 },
        includedRegionCodes: ["us"],
      };

      const { suggestions: results = [] } = await window.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

      setSuggestions(results);
      setIsOpen(results.length > 0);
      setActiveIndex(-1);
    } catch (err) {
      console.error("AutocompleteSuggestion fetch failed", err);
      setSuggestions([]);
      setIsOpen(false);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value || "";
    onChange(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 260);
  };

  const selectSuggestion = async (suggestion) => {
    const prediction = suggestion.placePrediction;
    const placeId = prediction?.placeId;

    if (!prediction || !placeId) {
      setIsOpen(false);
      setSuggestions([]);
      return;
    }

    setIsOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);

    try {
      // Modern Places API (New): resolve the prediction to a Place and fetch its
      // address components (incl. postal_code) and formatted address.
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['addressComponents', 'formattedAddress'] });

      const parsed = parseGooglePlaceAddress(place);
      const visible = getGrassrootsVisibleAddressLine(parsed) || place.formattedAddress || "";

      onChange(visible);
      onPlaceSelect?.({ ...parsed, address: visible });
    } catch (err) {
      console.error("Place.fetchFields selection failed", err);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        inputRef.current &&
        !inputRef.current.contains(event.target)
      ) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <label style={{ display: "block" }}>
        <Label>{label}</Label>
        <input
          ref={inputRef}
          value={value || ""}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
          style={{ ...INPUT_STYLE, background: C.bg }}
        />
      </label>

      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 100,
            background: "#fff",
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
            marginTop: 2,
            maxHeight: 300,
            overflowY: "auto",
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          {suggestions.map((s, index) => {
            const pred = s.placePrediction;
            const main = pred?.text?.text || "";
            const secondary = pred?.structuredFormat?.secondaryText?.text || "";

            return (
              <div
                key={index}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  selectSuggestion(s);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  selectSuggestion(s);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                style={{
                  padding: "6px 12px",
                  fontSize: 13,
                  cursor: "pointer",
                  background: index === activeIndex ? "#F3F4F6" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {main}
                  </div>
                  {secondary && (
                    <div style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {secondary}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div style={{
            padding: "4px 12px",
            fontSize: 10,
            color: "#9CA3AF",
            background: "#F9FAFB",
            borderTop: `1px solid ${C.borderLight}`,
            textAlign: "right",
          }}>
            Suggestions powered by Google
          </div>
        </div>
      )}
    </div>
  );
}

// Organizer typeahead — same dropdown UI as the Google Places address input, but
// suggests organizers already stored in the system (no manual re-typing).
export function OrganizerAutocomplete({ label = "Organizer", value, onChange, options = [], placeholder = "Organizer" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  const q = String(value || "").trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    return options.filter((o) => o.toLowerCase().includes(q) && o.toLowerCase() !== q).slice(0, 8);
  }, [options, q]);

  useEffect(() => {
    const handle = (e) => {
      if (dropdownRef.current?.contains(e.target) || inputRef.current?.contains(e.target)) return;
      setIsOpen(false);
      setActiveIndex(-1);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const choose = (org) => { onChange(org); setIsOpen(false); setActiveIndex(-1); };

  const handleKeyDown = (e) => {
    if (!isOpen || matches.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((p) => Math.min(p + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((p) => Math.max(p - 1, 0)); }
    else if (e.key === "Enter" && activeIndex >= 0) { e.preventDefault(); choose(matches[activeIndex]); }
    else if (e.key === "Escape") { setIsOpen(false); setActiveIndex(-1); }
  };

  return (
    <div style={{ position: "relative" }}>
      <label style={{ display: "block" }}>
        {label ? <Label>{label}</Label> : null}
        <input
          ref={inputRef}
          value={value || ""}
          onChange={(e) => { onChange(e.target.value); setIsOpen(true); setActiveIndex(-1); }}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (matches.length > 0) setIsOpen(true); }}
          placeholder={placeholder}
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
          style={{ ...INPUT_STYLE }}
        />
      </label>

      {isOpen && matches.length > 0 && (
        <div
          ref={dropdownRef}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 100,
            background: "#fff",
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
            marginTop: 2,
            maxHeight: 300,
            overflowY: "auto",
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          {matches.map((org, index) => (
            <div
              key={org}
              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); choose(org); }}
              onClick={() => choose(org)}
              onMouseEnter={() => setActiveIndex(index)}
              style={{
                padding: "6px 12px",
                fontSize: 13,
                cursor: "pointer",
                background: index === activeIndex ? "#F3F4F6" : "transparent",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0, fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {org}
              </div>
            </div>
          ))}
          <div style={{ padding: "4px 12px", fontSize: 10, color: "#9CA3AF", background: "#F9FAFB", borderTop: `1px solid ${C.borderLight}`, textAlign: "right" }}>
            Existing organizers
          </div>
        </div>
      )}
    </div>
  );
}

export function GooglePlacesBusinessInput({
  label,
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Start typing a business",
  internalOptions = [],
  onInternalSelect,
  internalLabel = "Existing businesses",
  googleLabel = "Google Places",
}) {
  const inputRef = useRef(null);
  const wrapperRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const detailsServiceRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const requestIdRef = useRef(0);
  const selectedValueRef = useRef("");
  const [placesReady, setPlacesReady] = useState(false);
  const [predictions, setPredictions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const resetSessionToken = useCallback(() => {
    if (window.google?.maps?.places?.AutocompleteSessionToken) {
      sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadGooglePlacesScript().then((ready) => {
      if (cancelled || !ready || !inputRef.current || !window.google?.maps?.places) return;
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
      detailsServiceRef.current = new window.google.maps.places.PlacesService(document.createElement("div"));
      resetSessionToken();
      setPlacesReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [resetSessionToken]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const query = String(value || "").trim();
    if (!placesReady || query.length < 2 || query === selectedValueRef.current) {
      setPredictions([]);
      setIsSearching(false);
      setActiveIndex(internalOptions.length > 0 ? 0 : -1);
      return undefined;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsSearching(true);
    const timerId = window.setTimeout(() => {
      autocompleteServiceRef.current?.getPlacePredictions({
        input: query,
        types: ["establishment"],
        componentRestrictions: { country: "us" },
        sessionToken: sessionTokenRef.current,
      }, (results = [], status) => {
        if (requestIdRef.current !== requestId) return;
        const okStatus = window.google?.maps?.places?.PlacesServiceStatus?.OK;
        const nextPredictions = status === okStatus ? results.slice(0, 6) : [];
        setPredictions(nextPredictions);
        setActiveIndex(internalOptions.length > 0 || nextPredictions.length > 0 ? 0 : -1);
        setIsOpen(internalOptions.length > 0 || nextPredictions.length > 0 || query.length >= 2);
        setIsSearching(false);
      });
    }, 140);
    return () => window.clearTimeout(timerId);
  }, [internalOptions.length, placesReady, value]);

  useEffect(() => {
    const query = String(value || "").trim();
    if (query.length >= 2 && internalOptions.length > 0) {
      setIsOpen(true);
      setActiveIndex((current) => (current < 0 ? 0 : current));
    }
  }, [internalOptions.length, value]);

  const applyPlace = useCallback((place, fallbackName = "") => {
    const name = extractGooglePlaceBusinessName(place, fallbackName);
    const parsedAddress = parseGooglePlaceAddress(place);
    const category = inferGrassrootsBusinessCategoryFromPlace(place, name);
    selectedValueRef.current = name;
    onChange(name);
    if (inputRef.current) inputRef.current.value = name;
    onPlaceSelect?.({
      ...parsedAddress,
      address: parsedAddress.address || place?.formatted_address || "",
      name,
      business_category: category,
      drop_category: category,
      contact_phone: place?.formatted_phone_number || "",
      website: place?.website || "",
    });
    setPredictions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    setIsSearching(false);
    resetSessionToken();
  }, [onChange, onPlaceSelect, resetSessionToken]);

  const selectPrediction = useCallback((prediction) => {
    if (!prediction?.place_id || !detailsServiceRef.current) return;
    const fallbackName = prediction.structured_formatting?.main_text || prediction.description || "";
    setIsSearching(true);
    detailsServiceRef.current.getDetails({
      placeId: prediction.place_id,
      fields: ["address_components", "formatted_address", "formatted_phone_number", "name", "place_id", "types", "website"],
      sessionToken: sessionTokenRef.current,
    }, (place, status) => {
      const okStatus = window.google?.maps?.places?.PlacesServiceStatus?.OK;
      if (status === okStatus && place) {
        applyPlace(place, fallbackName);
        return;
      }
      applyPlace({
        formatted_address: "",
        name: fallbackName,
        place_id: prediction.place_id,
        types: prediction.types || [],
      }, fallbackName);
    });
  }, [applyPlace]);

  const selectInternalOption = useCallback((option) => {
    if (!option?.target) return;
    const name = option.target.name || "";
    selectedValueRef.current = name;
    onChange(name);
    if (inputRef.current) inputRef.current.value = name;
    onInternalSelect?.(option.target, option);
    setPredictions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    setIsSearching(false);
  }, [onChange, onInternalSelect]);

  const handleKeyDown = (event) => {
    const totalOptions = internalOptions.length + predictions.length;
    if (!isOpen || totalOptions === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % totalOptions);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? totalOptions - 1 : current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const index = Math.max(0, activeIndex);
      if (index < internalOptions.length) {
        selectInternalOption(internalOptions[index]);
      } else {
        selectPrediction(predictions[index - internalOptions.length]);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
    }
  };

  const showPanel = isOpen && (internalOptions.length > 0 || predictions.length > 0 || isSearching);

  return (
    <div className="grassroots-places-field" ref={wrapperRef}>
      <Label>{label}</Label>
      <div className="grassroots-places-anchor">
        <input
          ref={inputRef}
          value={value || ""}
          onChange={(event) => {
            selectedValueRef.current = "";
            onChange(event.target.value);
          }}
          onFocus={() => {
            if (internalOptions.length > 0 || predictions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
          style={INPUT_STYLE}
        />
        {showPanel && (
          <div className="grassroots-places-panel" role="listbox">
            {internalOptions.length > 0 && (
              <>
                <div className="grassroots-places-section-label">{internalLabel}</div>
                {internalOptions.map((option, index) => {
                  const active = index === activeIndex;
                  return (
                    <button
                      key={option.target?.id || option.label}
                      type="button"
                      className={`grassroots-places-option is-internal${active ? " is-active" : ""}`}
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectInternalOption(option)}
                    >
                      <span className="grassroots-places-pin is-internal" aria-hidden="true">
                        <I.CheckCircle />
                      </span>
                      <span className="grassroots-places-copy">
                        <span className="grassroots-places-main">{option.target?.name || "Existing business"}</span>
                        <span className="grassroots-places-secondary">{option.subtitle}</span>
                      </span>
                      <span className="grassroots-places-category">{option.badge}</span>
                    </button>
                  );
                })}
              </>
            )}
            {(predictions.length > 0 || isSearching) && (
              <div className="grassroots-places-section-label">{googleLabel}</div>
            )}
            {predictions.map((prediction, index) => {
              const mainText = prediction.structured_formatting?.main_text || cleanGooglePlaceBusinessLabel(prediction.description);
              const secondaryText = getGooglePredictionSecondaryText(prediction);
              const inferredCategory = inferGrassrootsBusinessCategoryFromPlace({ name: mainText, types: prediction.types || [] }, mainText);
              const combinedIndex = internalOptions.length + index;
              const active = combinedIndex === activeIndex;
              return (
                <button
                  key={prediction.place_id || prediction.description}
                  type="button"
                  className={`grassroots-places-option${active ? " is-active" : ""}`}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIndex(combinedIndex)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectPrediction(prediction)}
                >
                  <span className="grassroots-places-pin" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="12" cy="10" r="2" fill="currentColor" />
                    </svg>
                  </span>
                  <span className="grassroots-places-copy">
                    <span className="grassroots-places-main">
                      {renderGooglePredictionText(mainText, prediction.structured_formatting?.main_text_matched_substrings)}
                    </span>
                    {secondaryText && <span className="grassroots-places-secondary">{secondaryText}</span>}
                  </span>
                  {inferredCategory && <span className="grassroots-places-category">{inferredCategory}</span>}
                </button>
              );
            })}
            {predictions.length === 0 && isSearching && (
              <div className="grassroots-places-loading">Searching...</div>
            )}
            <div className="grassroots-places-footer">
              <span>powered by</span>
              <span className="grassroots-google-wordmark"><span>G</span><span>o</span><span>o</span><span>g</span><span>l</span><span>e</span></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SplitAddressFields({ draft, onChange, onPlaceSelect, placeholder = "Address" }) {
  const [copyState, setCopyState] = useState("idle");
  const copyResetTimer = useRef(null);
  const fullAddressInputRef = useRef(null);
  const showCopiedState = useCallback((duration = 1600) => {
    if (copyResetTimer.current) window.clearTimeout(copyResetTimer.current);
    setCopyState("copied");
    copyResetTimer.current = window.setTimeout(() => setCopyState("idle"), duration);
  }, []);
  const handlePlaceSelect = useCallback((parts) => {
    const visibleAddressLine = getGrassrootsVisibleAddressLine(parts);
    onPlaceSelect?.({
      ...parts,
      address: visibleAddressLine || parts?.address || "",
    });
  }, [onPlaceSelect]);
  const fullAddress = buildGrassrootsLegacyAddressFromSplitAddress(draft) || String(draft.address || "").trim();
  const handleCopyAddress = async () => {
    if (!fullAddress) return;
    if (copyResetTimer.current) window.clearTimeout(copyResetTimer.current);
    try {
      const result = await copyGrassrootsTextToClipboard(fullAddress, fullAddressInputRef.current);
      if (!result.copied) {
        fullAddressInputRef.current?.focus({ preventScroll: true });
        fullAddressInputRef.current?.select();
      }
      if (result.copied) {
        showCopiedState();
      } else {
        setCopyState("manual");
      }
    } catch {
      fullAddressInputRef.current?.focus({ preventScroll: true });
      fullAddressInputRef.current?.select();
      setCopyState("manual");
    }
  };
  const handleFullAddressCopy = (event) => {
    const input = event.currentTarget;
    const selectedText = String(input.value || "").slice(input.selectionStart || 0, input.selectionEnd || 0);
    if (selectedText && selectedText === fullAddress) showCopiedState();
  };
  const handleFullAddressBlur = () => {
    if (copyState === "manual") setCopyState("idle");
  };

  useEffect(() => () => {
    if (copyResetTimer.current) window.clearTimeout(copyResetTimer.current);
  }, []);

  return (
    <>
      <GooglePlacesAddressInput
        label="Street"
        value={draft.address_line_1}
        onChange={(value) => {
          onChange("address_line_1", value);
          onChange("address", value);
        }}
        onPlaceSelect={handlePlaceSelect}
        placeholder={placeholder || "Street address"}
      />
      <FieldEditor field={{ key: "address_line_2", label: "Unit", placeholder: "Suite, booth, or unit" }} value={draft.address_line_2} onChange={(value) => onChange("address_line_2", value)} />
      <FieldEditor field={{ key: "address_city", label: "City", placeholder: "City" }} value={draft.address_city} onChange={(value) => onChange("address_city", value)} />
      <FieldEditor field={{ key: "address_state", label: "State", placeholder: "State" }} value={draft.address_state} onChange={(value) => onChange("address_state", value)} />
      <FieldEditor field={{ key: "address_postal_code", label: "ZIP", placeholder: "ZIP" }} value={draft.address_postal_code} onChange={(value) => onChange("address_postal_code", value)} />
      <FieldEditor field={{ key: "address_country", label: "Country", placeholder: "Country" }} value={draft.address_country} onChange={(value) => onChange("address_country", value)} />
      <div className="grassroots-address-copy-field">
        <Label>Full Address</Label>
        <div className={`grassroots-address-copy-shell is-${copyState}`}>
          <input
            ref={fullAddressInputRef}
            value={fullAddress}
            readOnly
            placeholder="Full address builds from the fields above"
            style={{ ...INPUT_STYLE, background: C.bg, paddingRight: copyState === "manual" ? 132 : 104 }}
            onCopy={handleFullAddressCopy}
            onBlur={handleFullAddressBlur}
          />
          <button
            type="button"
            onClick={handleCopyAddress}
            disabled={!fullAddress}
            className={`grassroots-address-copy-button is-${copyState}`}
            aria-label={copyState === "copied" ? "Address copied" : copyState === "manual" ? "Automatic copy unavailable. Press Command C to copy the selected address." : "Copy full address"}
            aria-live="polite"
          >
            <span className="grassroots-copy-icon-stack" aria-hidden="true">
              <span className="grassroots-copy-clipboard"><I.Clipboard /></span>
              <span className="grassroots-copy-check"><I.Check /></span>
            </span>
            <span className="grassroots-copy-label">
              {copyState === "copied" ? "Copied" : copyState === "manual" ? "Press Cmd+C" : "Copy"}
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
