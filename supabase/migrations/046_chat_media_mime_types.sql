-- Áudio do WhatsApp vem como "audio/ogg; codecs=opus"; o storage rejeitava.
-- Também libera imagem/vídeo/documento usados no inbox.
update storage.buckets
set allowed_mime_types = array[
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/amr',
  'audio/opus',
  'audio/webm',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/3gpp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/octet-stream'
]
where id = 'chat-media';
