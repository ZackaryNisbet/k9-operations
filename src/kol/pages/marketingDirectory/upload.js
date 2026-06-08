// File-upload helpers for the Marketing Directory page
// (src/kol/pages/MarketingDirectoryPage.jsx).
import { isHeicFile } from "../../marketingDirectoryData";

export function clientUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// HEIC/HEIF → JPEG (same approach as PhotosPage) so iPhone business-card photos
// upload as a web-displayable image. Other files pass through untouched.
export async function normalizeUploadFile(file) {
  if (!isHeicFile(file)) return file;
  const heic2any = (await import("heic2any")).default;
  const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  const converted = Array.isArray(blob) ? blob[0] : blob;
  const newName = (file.name || "card").replace(/\.(heic|heif)$/i, ".jpg");
  return new File([converted], newName, { type: "image/jpeg", lastModified: file.lastModified || Date.now() });
}
