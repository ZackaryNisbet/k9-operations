-- Interview audio uploads are capped at xAI STT's current max upload size: 500 MB.
UPDATE storage.buckets
SET
  file_size_limit = 524288000,
  allowed_mime_types = ARRAY[
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
    'audio/webm',
    'audio/x-matroska',
    'audio/x-m4a',
    'audio/x-wav',
    'video/mp4',
    'video/webm',
    'video/x-matroska',
    'application/x-matroska'
  ]::text[]
WHERE id = 'labor-interview-documents';
