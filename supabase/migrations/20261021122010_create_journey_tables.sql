/*
# Create journeys and journey_watches tables for WAYPOINT AI

## Overview
WAYPOINT AI's Journey Guardian capability lets users save planned trips and
enable monitoring. These tables store saved journeys and their watch state.

## Tables

### journeys
- id (uuid PK)
- user_id (uuid, nullable for anon demo)
- origin (text) — origin place name
- destination (text) — destination place name
- origin_lat, origin_lng (float8) — resolved coordinates
- dest_lat, dest_lng (float8) — resolved coordinates
- travel_mode (text) — driving, cycling, walking, transit
- departure_at (timestamptz) — planned departure
- route_data (jsonb) — route geometry from OSRM
- created_at, updated_at (timestamptz)

### journey_watches
- id (uuid PK)
- journey_id (uuid FK to journeys cascade)
- enabled (bool default false)
- alert_preferences (jsonb) — which alert types to send
- next_check_at (timestamptz)
- last_check_at (timestamptz)
- last_status (text)
- created_at, updated_at (timestamptz)

## Security
No-auth demo app: CRUD open to anon + authenticated with USING/WITH CHECK true.
*/

CREATE TABLE IF NOT EXISTS journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  origin text NOT NULL,
  destination text NOT NULL,
  origin_lat double precision,
  origin_lng double precision,
  dest_lat double precision,
  dest_lng double precision,
  travel_mode text NOT NULL DEFAULT 'driving',
  departure_at timestamptz,
  route_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journeys_created_idx ON journeys (created_at DESC);

ALTER TABLE journeys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_journeys" ON journeys;
CREATE POLICY "anon_select_journeys" ON journeys FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_journeys" ON journeys;
CREATE POLICY "anon_insert_journeys" ON journeys FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_journeys" ON journeys;
CREATE POLICY "anon_update_journeys" ON journeys FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_journeys" ON journeys;
CREATE POLICY "anon_delete_journeys" ON journeys FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS journey_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  alert_preferences jsonb NOT NULL DEFAULT '{"new_reports":true,"weather_warnings":true,"closures":true}'::jsonb,
  next_check_at timestamptz,
  last_check_at timestamptz,
  last_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journey_watches_journey_idx ON journey_watches (journey_id);
CREATE INDEX IF NOT EXISTS journey_watches_enabled_idx ON journey_watches (enabled, next_check_at);

ALTER TABLE journey_watches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_journey_watches" ON journey_watches;
CREATE POLICY "anon_select_journey_watches" ON journey_watches FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_journey_watches" ON journey_watches;
CREATE POLICY "anon_insert_journey_watches" ON journey_watches FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_journey_watches" ON journey_watches;
CREATE POLICY "anon_update_journey_watches" ON journey_watches FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_journey_watches" ON journey_watches;
CREATE POLICY "anon_delete_journey_watches" ON journey_watches FOR DELETE
  TO anon, authenticated USING (true);
