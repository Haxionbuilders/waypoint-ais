/*
# Enhance Reports Table for Photo Reports & Vision Analysis

1. Schema Updates:
  - Add `image_url` (text, nullable)
  - Add `observed_objects` (jsonb, default '[]')
  - Add `safety_notes` (text, nullable)
  - Add `ai_confidence` (double precision, nullable)
  - Add `source` (text, default 'manual' — 'ai_vision', 'manual')
*/

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS observed_objects jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS safety_notes text,
  ADD COLUMN IF NOT EXISTS ai_confidence double precision,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS reports_source_idx ON reports (source);
