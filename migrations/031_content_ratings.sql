-- Migration 031: Content age-ratings cache
-- Populated server-side from TMDB /release_dates (movies) and /content_ratings (TV).
-- Also stores certs extracted directly from the Xtream provider metadata.
-- Fully idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS content_ratings (
  id            BIGSERIAL PRIMARY KEY,
  content_type  TEXT        NOT NULL CHECK (content_type IN ('movie', 'tv')),
  tmdb_id       BIGINT      NOT NULL,
  certification TEXT        NOT NULL,
  age_int       SMALLINT    NOT NULL,
  source        TEXT        NOT NULL DEFAULT 'tmdb',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (content_type, tmdb_id)
);

CREATE INDEX IF NOT EXISTS content_ratings_lookup_idx
  ON content_ratings (content_type, tmdb_id);
