UPDATE storage.buckets
SET
  file_size_limit = 12582912,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'dog-profile-pics';
