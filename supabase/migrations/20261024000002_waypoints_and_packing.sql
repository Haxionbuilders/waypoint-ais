-- Tables the frontend uses but earlier migrations never created.
CREATE TABLE IF NOT EXISTS waypoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  booking_type text NOT NULL DEFAULT 'other',
  provider text DEFAULT '',
  confirmation_number text DEFAULT '',
  start_time timestamptz,
  end_time timestamptz,
  location text DEFAULT '',
  address text DEFAULT '',
  deadline timestamptz,
  action_required text,
  confidence integer DEFAULT 0,
  lat double precision,
  lng double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS waypoints_journey_idx ON waypoints (journey_id);

CREATE TABLE IF NOT EXISTS packing_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_key text NOT NULL DEFAULT 'guest',
  destination text NOT NULL,
  purpose text NOT NULL DEFAULT 'client_meeting',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_key, destination)
);

ALTER TABLE waypoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE packing_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "waypoints_all" ON waypoints;
CREATE POLICY "waypoints_all" ON waypoints FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "packing_all" ON packing_checklists;
CREATE POLICY "packing_all" ON packing_checklists FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
