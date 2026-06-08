// K9 Operations — PhotosPage image utilities
// Canvas-based derivative generation (thumbnail + medium display image) and
// natural-dimension probing. Pure helpers; no React/component state involved.
// Extracted verbatim from PhotosPage.jsx.

const THUMBNAIL_WIDTH = 300;
const AI_IMAGE_WIDTH = 1600;

// ─── Generate thumbnail via Canvas ──────────────────────────────────────────
export function generateThumbnail(file) {
  return generateResizedJpeg(file, THUMBNAIL_WIDTH, 0.8);
}

// ─── Generate medium AI/display derivative via Canvas ───────────────────────
export function generateAiImage(file) {
  return generateResizedJpeg(file, AI_IMAGE_WIDTH, 0.78);
}

function generateResizedJpeg(file, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(maxWidth / img.naturalWidth, 1);
      const width = Math.round(img.naturalWidth * scale);
      const height = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob failed"));
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
    img.src = url;
  });
}

export function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
    img.src = url;
  });
}
