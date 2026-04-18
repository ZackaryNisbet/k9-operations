-- Interview audio uploads need to support Zoom audio files safely up to 100 MB.
-- xAI STT currently accepts substantially larger files, so 100 MB is our app cap.
UPDATE storage.buckets
SET
  file_size_limit = 104857600,
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
    'audio/x-m4a',
    'audio/x-wav',
    'video/mp4'
  ]::text[]
WHERE id = 'labor-interview-documents';
