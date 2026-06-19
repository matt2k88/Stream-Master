-- Ultra Tube access: maps each ultracast account username to Ultra Tube credentials.
-- username must match the xtream-codes login username stored in account_username.
CREATE TABLE IF NOT EXISTS ultra_tube_access (
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  username             text        NOT NULL UNIQUE,   -- ultracast iptv account username (lowercase)
  ultra_tube_username  text        NOT NULL,
  ultra_tube_password  text        NOT NULL,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

-- Ultra Tube app config: apk download URL, downloader code, badge toggle.
-- Only ever has a single row (id = 1). Editable from the external admin app.
CREATE TABLE IF NOT EXISTS ultra_tube_config (
  id              int         PRIMARY KEY,
  apk_url         text        NOT NULL DEFAULT 'https://app.ultracast.co.uk/ultratube2.apk',
  downloader_code text        NOT NULL DEFAULT '6844940',
  show_badge      boolean     NOT NULL DEFAULT true,
  updated_at      timestamptz DEFAULT now()
);

-- Seed the single config row (no-op if already present).
INSERT INTO ultra_tube_config (id, apk_url, downloader_code, show_badge)
VALUES (1, 'https://app.ultracast.co.uk/ultratube2.apk', '6844940', true)
ON CONFLICT (id) DO NOTHING;
