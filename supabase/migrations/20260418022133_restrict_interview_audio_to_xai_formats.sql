-- Keep interview audio storage restrictions aligned to xAI STT documented container formats.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
    'application/pdf',
    'text/plain',
    'text/vtt',
    'application/json',
    'audio/aac',
    'audio/flac',
    'audio/m4a',
    'audio/mp4',
    'audio/mpeg',
    'audio/mp3',
    'audio/ogg',
    'audio/opus',
    'audio/wav',
    'audio/x-matroska',
    'audio/x-m4a',
    'audio/x-wav',
    'video/mp4',
    'video/x-matroska',
    'application/x-matroska'
  ]::text[]
WHERE id = 'labor-interview-documents';
