import React from "react";

// Icons in ../../shared/icons are fixed-size, prop-less SVGs. Glyph wraps one so a
// call site can set its size + color: the `.md-glyph > svg` rule (injected once in
// the page root) lets CSS dimensions on the wrapper drive the SVG, since CSS beats
// the SVG's hardcoded width/height attributes. Color flows through `currentColor`.
export function Glyph({ icon: IconCmp, size = 16, color, style }) {
  if (!IconCmp) return null;
  return (
    <span className="md-glyph" style={{ width: size, height: size, color, display: "inline-flex", flexShrink: 0, ...style }}>
      <IconCmp />
    </span>
  );
}
