-- Per-profile VLC hardware-decoding preference.
-- Some Android / Fire TV devices have a flaky hardware video decoder that
-- produces green/garbled frames, stutter, or no audio on the VLC engine
-- even though other VLC-based apps work. This lets each profile override
-- how VLC decodes:
--   'auto' — let libVLC decide (the existing/default behaviour).
--   'on'   — force hardware acceleration (best for 4K/HDR on capable devices).
--   'off'  — force pure software decoding (fixes the flaky-decoder devices).
-- Only affects the VLC engine; the Expo engine ignores it. Default 'auto'
-- so existing users see no behaviour change until they opt in.

alter table profiles
  add column if not exists player_hw_decode text not null default 'auto';

-- Enforce the three valid modes. Drop & re-add so re-running is safe.
alter table profiles drop constraint if exists profiles_player_hw_decode_check;
alter table profiles
  add constraint profiles_player_hw_decode_check
    check (player_hw_decode in ('auto', 'on', 'off'));
