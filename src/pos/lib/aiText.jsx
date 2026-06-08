import React from "react";

function renderAIFormattedText(text) {
  if (!text) return null;
  const sections = text.split(/\n\n+/);
  return sections.map((section, si) => {
    const lines = section.split(/\n/);
    const isBulletSection = lines.length > 1 && lines.every(l => !l.trim() || /^[-*•]\s/.test(l.trim()));
    if (isBulletSection) {
      return React.createElement("ul", { key: si, style: { margin: "8px 0", paddingLeft: 20, listStyle: "disc" } },
        lines.filter(l => l.trim()).map((line, li) =>
          React.createElement("li", { key: li, style: { marginBottom: 4, fontSize: 13, lineHeight: 1.5 } },
            renderAIInline(line.replace(/^[-*•]\s*/, ""))
          )
        )
      );
    }
    return React.createElement("p", { key: si, style: { margin: si === 0 ? 0 : "10px 0 0", fontSize: 13, lineHeight: 1.5 } }, renderAIInline(section));
  });
}

function renderAIInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return React.createElement("strong", { key: i }, part.slice(2, -2));
    }
    return part;
  });
}

export { renderAIFormattedText, renderAIInline };
