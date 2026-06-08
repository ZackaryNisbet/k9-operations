import React from "react";
import { C } from "../../../../shared/theme";
import { wordMatchesSearch } from "../helpers";

export function TranscriptWords({ turn, currentTime, maxWords = null, searchQuery = "", tone = "light" }) {
  const words = Array.isArray(turn?.words) && turn.words.length
    ? turn.words
    : String(turn?.text || "").split(/\s+/).filter(Boolean).map((text, index) => ({ id: `${turn?.id || "turn"}-${index}`, text }));
  const visibleWords = maxWords ? words.slice(0, maxWords) : words;
  const time = Number(currentTime || 0);
  const dark = tone === "dark";
  return (
    <span>
      {visibleWords.map((word) => {
        const active = Number.isFinite(time)
          && word.startSeconds != null
          && word.endSeconds != null
          && time >= word.startSeconds
          && time <= word.endSeconds;
        const searched = wordMatchesSearch(word.text, searchQuery);
        return (
          <span
            key={word.id}
            style={{
              display: "inline-block",
              marginRight: 5,
              marginBottom: 3,
              borderRadius: 6,
              padding: dark ? "0 3px" : "0 2px",
              background: active
                ? (dark ? "#bef264" : "#dcfce7")
                : searched
                  ? (dark ? "rgba(250,204,21,0.22)" : "#fef3c7")
                  : "transparent",
              color: active ? (dark ? "#052e16" : C.pri) : searched ? (dark ? "#fde68a" : "#92400e") : "inherit",
              boxShadow: active && dark ? "0 0 22px rgba(190, 242, 100, 0.28)" : "none",
              transition: "background 120ms ease, color 120ms ease, box-shadow 120ms ease",
            }}
          >
            {word.text}
          </span>
        );
      })}
      {maxWords && words.length > maxWords && <span style={{ color: C.textMut }}>...</span>}
    </span>
  );
}
