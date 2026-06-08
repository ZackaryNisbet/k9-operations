import { useEffect, useState } from "react";
import { DIRECTORY_CSS } from "./constants";

export function useDirectoryStyles() {
  useEffect(() => {
    if (document.getElementById("k9-enterprise-directory-css")) return;
    const style = document.createElement("style");
    style.id = "k9-enterprise-directory-css";
    style.textContent = DIRECTORY_CSS;
    document.head.appendChild(style);
  }, []);
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, [query]);
  return matches;
}
