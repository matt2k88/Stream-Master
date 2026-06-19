-- Per-profile custom avatar photo (base64 JPEG, set via the phone QR-code
-- upload flow). NULL means use the existing icon+colour avatar.
alter table profiles
  add column if not exists avatar_image text;
