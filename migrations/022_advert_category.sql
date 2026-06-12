-- Migration 022: add category column to adverts table
-- Run this in the Supabase SQL editor.

ALTER TABLE adverts
  ADD COLUMN IF NOT EXISTS category TEXT CHECK (
    category IS NULL OR category IN (
      'featured_event',
      'featured_movie',
      'featured_series',
      'upcoming_event',
      'new_release',
      'coming_soon',
      'exclusive',
      'featured_advert'
    )
  );
