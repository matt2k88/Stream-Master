-- Migration 032: stream_ratings — per-stream age certificate cache
-- Keyed by (stream_id, content_type) so parental controls can filter
-- the full vodStreams / seriesList arrays in O(1) per item.
-- Populated by the client-side background enricher via /api/stream-ratings/batch.
-- Fully idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS stream_ratings (
  stream_id    INTEGER     NOT NULL,
  content_type TEXT        NOT NULL CHECK (content_type IN ('movie', 'tv')),
  certification TEXT       NOT NULL,
  age_int      SMALLINT    NOT NULL,
  tmdb_id      BIGINT,
  source       TEXT        NOT NULL DEFAULT 'tmdb',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (stream_id, content_type)
);

CREATE INDEX IF NOT EXISTS stream_ratings_age_idx
  ON stream_ratings (content_type, age_int);

-- Allow the Express server (anon key) to read/write this table.
ALTER TABLE stream_ratings DISABLE ROW LEVEL SECURITY;
