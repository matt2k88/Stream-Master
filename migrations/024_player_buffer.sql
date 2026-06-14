-- Per-profile network pre-buffer size preference (milliseconds).
-- Controls how far ahead of playback the player buffers the stream.
-- Larger = smoother on unstable connections; smaller = closer to the live edge.
-- Default 3000 ms (3 seconds) — safe for most IPTV connections.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS player_buffer_ms INTEGER NOT NULL DEFAULT 3000;
