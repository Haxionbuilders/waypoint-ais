/*
# Add User Authentication Scoping & Create Reports Table

1. Schema Updates:
  - Add `user_id` (foreign key to `auth.users(id)`) to:
    - `conversations`
    - `ticket_orders`
    - `location_tracks`
    (Note: `journeys` already has `user_id uuid`).
  - Create `reports` table for road hazard reports (referenced by waypoint-agent edge function).
  - Create `find_reports_within_radius` function for spatial proximity search.

2. Row Level Security (RLS):
  - Authenticated users access their own records (`auth.uid() = user_id`).
  - Anonymous / Guest users access demo records where `user_id IS NULL`.
  - Road hazard `reports` are publicly readable by everyone, and submittable by all users.
*/

-- 1. Alter tables to add user_id with cascade delete
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS conversations_user_idx ON conversations (user_id);

ALTER TABLE ticket_orders
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ticket_orders_user_idx ON ticket_orders (user_id);

ALTER TABLE location_tracks
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS location_tracks_user_idx ON location_tracks (user_id);

CREATE INDEX IF NOT EXISTS journeys_user_idx ON journeys (user_id);

-- 2. Create reports table
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text DEFAULT '',
  category text NOT NULL,
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'Submitted',
  location_name text DEFAULT 'Unspecified location',
  latitude double precision,
  longitude double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_created_idx ON reports (created_at DESC);
CREATE INDEX IF NOT EXISTS reports_location_idx ON reports (latitude, longitude);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_reports" ON reports;
CREATE POLICY "public_select_reports" ON reports FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_insert_reports" ON reports;
CREATE POLICY "public_insert_reports" ON reports FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- 3. Stored Procedure for Proximity Search
CREATE OR REPLACE FUNCTION find_reports_within_radius(
  center_lat double precision,
  center_lng double precision,
  radius_km double precision
)
RETURNS SETOF reports
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM reports
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    AND (
      6371 * acos(
        LEAST(1.0, GREATEST(-1.0,
          cos(radians(center_lat)) * cos(radians(latitude)) *
          cos(radians(longitude) - radians(center_lng)) +
          sin(radians(center_lat)) * sin(radians(latitude))
        ))
      )
    ) <= radius_km
  ORDER BY created_at DESC;
$$;

-- 4. User-Scoped RLS Policies for Conversations
DROP POLICY IF EXISTS "user_select_conversations" ON conversations;
CREATE POLICY "user_select_conversations" ON conversations FOR SELECT
  TO anon, authenticated
  USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR (auth.uid() IS NULL AND user_id IS NULL)
  );

DROP POLICY IF EXISTS "user_insert_conversations" ON conversations;
CREATE POLICY "user_insert_conversations" ON conversations FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    (auth.uid() IS NOT NULL AND (auth.uid() = user_id OR user_id IS NULL))
    OR (auth.uid() IS NULL AND user_id IS NULL)
  );

DROP POLICY IF EXISTS "user_update_conversations" ON conversations;
CREATE POLICY "user_update_conversations" ON conversations FOR UPDATE
  TO anon, authenticated
  USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR (auth.uid() IS NULL AND user_id IS NULL)
  )
  WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR (auth.uid() IS NULL AND user_id IS NULL)
  );

DROP POLICY IF EXISTS "user_delete_conversations" ON conversations;
CREATE POLICY "user_delete_conversations" ON conversations FOR DELETE
  TO anon, authenticated
  USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR (auth.uid() IS NULL AND user_id IS NULL)
  );

-- 5. User-Scoped RLS Policies for Journeys
DROP POLICY IF EXISTS "user_select_journeys" ON journeys;
CREATE POLICY "user_select_journeys" ON journeys FOR SELECT
  TO anon, authenticated
  USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR (auth.uid() IS NULL AND user_id IS NULL)
  );

DROP POLICY IF EXISTS "user_insert_journeys" ON journeys;
CREATE POLICY "user_insert_journeys" ON journeys FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    (auth.uid() IS NOT NULL AND (auth.uid() = user_id OR user_id IS NULL))
    OR (auth.uid() IS NULL AND user_id IS NULL)
  );

-- 6. User-Scoped RLS Policies for Ticket Orders
DROP POLICY IF EXISTS "user_select_ticket_orders" ON ticket_orders;
CREATE POLICY "user_select_ticket_orders" ON ticket_orders FOR SELECT
  TO anon, authenticated
  USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR (auth.uid() IS NULL AND user_id IS NULL)
  );

DROP POLICY IF EXISTS "user_insert_ticket_orders" ON ticket_orders;
CREATE POLICY "user_insert_ticket_orders" ON ticket_orders FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    (auth.uid() IS NOT NULL AND (auth.uid() = user_id OR user_id IS NULL))
    OR (auth.uid() IS NULL AND user_id IS NULL)
  );
