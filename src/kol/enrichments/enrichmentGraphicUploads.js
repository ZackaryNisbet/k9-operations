const ALLOWED_GRAPHIC_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
const ALLOWED_GRAPHIC_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "pdf"]);

export function isAllowedGraphicFile(file) {
  if (!file) return false;
  if (ALLOWED_GRAPHIC_TYPES.has(file.type)) return true;
  return ALLOWED_GRAPHIC_EXTENSIONS.has(getRawGraphicExtension(file));
}

export function buildGraphicStoragePath(locationId, monthStart, audience, file) {
  const safeLocationId = sanitizePathSegment(locationId || "unknown");
  const safeAudience = sanitizePathSegment(audience || "graphic");
  const extension = getGraphicExtension(file);
  return `${safeLocationId}/${monthStart}/${safeAudience}.${extension}`;
}

export function getGraphicExtension(file) {
  const fromName = getRawGraphicExtension(file);
  if (ALLOWED_GRAPHIC_EXTENSIONS.has(fromName)) return fromName === "jpeg" ? "jpg" : fromName;
  if (file?.type === "image/png") return "png";
  if (file?.type === "image/jpeg") return "jpg";
  if (file?.type === "image/webp") return "webp";
  if (file?.type === "application/pdf") return "pdf";
  return "bin";
}

export function getGraphicContentType(file) {
  if (ALLOWED_GRAPHIC_TYPES.has(file?.type)) return file.type;
  const extension = getGraphicExtension(file);
  if (extension === "png") return "image/png";
  if (extension === "jpg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "pdf") return "application/pdf";
  return "application/octet-stream";
}

function getRawGraphicExtension(file) {
  return String(file?.name || "").split(".").pop()?.toLowerCase() || "";
}

function sanitizePathSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}
