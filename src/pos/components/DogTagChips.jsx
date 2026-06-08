import { I } from "../icons";
import { TAG_COLORS } from "../constants/colors";
import { Tip } from "./ui";

function DogTagChips({ dog, dogTags, size = "sm" }) {
  if (!dog.tags || dog.tags.length === 0) return null;
  if (size === "sm") {
    return (
      <div style={{ display: "inline-flex", gap: 3, flexWrap: "wrap" }}>
        {dog.tags.map(tagId => {
          const tag = dogTags.find(t => t.id === tagId);
          if (!tag) return null;
          const tc = TAG_COLORS[tag.colorIdx % TAG_COLORS.length];
          // Abbreviate: L for Large Playgroup, S for Small Playgroup, PP for Private Play, first 4 for single-word
          const abbr = tag.id === "tag_lp" ? "L" : tag.id === "tag_sp" ? "S" : tag.id === "tag_pp" ? "PP" : (() => { const words = tag.name.split(/\s+/); return words.length > 1 ? words.map(w => w[0]).join("").toUpperCase().slice(0, 2) : tag.name.toUpperCase().slice(0, 4); })();
          return (
            <Tip key={tagId} text={tag.name}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, borderRadius: 4, fontSize: 10, fontWeight: 800, background: tc.text, color: "#fff", cursor: "default", flexShrink: 0, padding: "0 4px", letterSpacing: 0 }}>{abbr}</span>
            </Tip>
          );
        })}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {dog.tags.map(tagId => {
        const tag = dogTags.find(t => t.id === tagId);
        if (!tag) return null;
        const tc = TAG_COLORS[tag.colorIdx % TAG_COLORS.length];
        return (
          <Tip key={tagId} text={tag.name}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700, background: tc.bg, color: tc.text, whiteSpace: "nowrap", cursor: "default" }}>
              <I.Tag />{tag.name}
            </span>
          </Tip>
        );
      })}
    </div>
  );
}

export { DogTagChips };
