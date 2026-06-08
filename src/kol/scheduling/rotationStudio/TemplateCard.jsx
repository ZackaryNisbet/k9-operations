import { getTemplateDisplayName } from "../rotationTemplateMatcher";
import { TemplateThumbnail } from "./TemplateThumbnail";

export function TemplateCard({
  match,
  applied,
  previewing,
  onPreview,
  onPreviewEnd,
  onApply,
}) {
  const displayName = getTemplateDisplayName(match);
  const confidence = match?.confidence || "fallback";
  const fit = Math.round(match?.score || 0);
  const explanation = match?.explanation || "Closest workbook match";
  return (
    <button
      type="button"
      className={`rotation-template-card${applied ? " is-applied" : ""}${previewing ? " is-previewing" : ""}`}
      aria-label={`${displayName}. ${confidence} confidence, ${fit} fit. ${explanation}`}
      title={`${displayName}\n${explanation}`}
      onMouseEnter={onPreview}
      onMouseLeave={onPreviewEnd}
      onFocus={onPreview}
      onBlur={onPreviewEnd}
      onClick={onApply}
    >
      <TemplateThumbnail match={match} />
      <span className="rotation-template-card-name">{displayName}</span>
    </button>
  );
}
