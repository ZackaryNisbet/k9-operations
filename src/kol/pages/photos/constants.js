// K9 Operations — PhotosPage constants
// Supabase storage bucket, public-URL builder, and upload constraints for the
// photo library. Extracted verbatim from PhotosPage.jsx.

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const PHOTO_BUCKET = "pet-photos";
export const photoPublicUrl = (storagePath) =>
  `${SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${storagePath}`;

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
