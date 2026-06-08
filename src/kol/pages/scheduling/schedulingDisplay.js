export const MATRIX_TABLE_FONT = "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export function formatVisibleSchedulingCopy(value) {
  return String(value ?? "").replace(/\bGingr\b/g, "Gingr");
}
