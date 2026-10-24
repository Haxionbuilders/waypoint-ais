/*
# Create TravBud ticket orders, email messages, and location tracks

1. New Tables
- `ticket_orders` stores ticket requests created through the TravBud AI agent.
  - `id`, `origin`, `destination`, `travel_mode`, `departure_date`,
    `traveler_count`, `fare_cents`, `currency`, `status`, `confirmation_code`,
    `created_at`
- `email_messages` stores synced travel email messages for the inbox feature.
  - `id`, `sender`, `subject`, `body`, `category`, `is_demo`, `received_at`
- `location_tracks` stores live GPS tracking points for route safety monitoring.
  - `id`, `lat`, `lng`, `accuracy`, `session_id`, `created_at`

2. Security
- Row level security is enabled on all three tables.
- This app has no sign-in screen, so all tables are readable and writable by
  anon and authenticated clients via four separate CRUD policies each.

3. Important Notes
- Orders are persisted so the agent can show booking history after reloads.
- Email messages are seeded by the agent when the user says "connect my email."
- Location tracks are written by the browser's geolocation watchPosition.
*/

CREATE TABLE IF NOT EXISTS ticket_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin text NOT NULL,
  destination text NOT NULL,
  travel_mode text NOT NULL DEFAULT 'train',
  departure_date date NOT NULL,
  traveler_count integer NOT NULL DEFAULT 1 CHECK (traveler_count > 0 AND traveler_count <= 9),
  fare_cents integer NOT NULL CHECK (fare_cents >= 0),
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'confirmed',
  confirmation_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_orders_created_idx ON ticket_orders (created_at DESC);

ALTER TABLE ticket_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ticket_orders" ON ticket_orders;
CREATE POLICY "anon_select_ticket_orders" ON ticket_orders FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ticket_orders" ON ticket_orders;
CREATE POLICY "anon_insert_ticket_orders" ON ticket_orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ticket_orders" ON ticket_orders;
CREATE POLICY "anon_update_ticket_orders" ON ticket_orders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_ticket_orders" ON ticket_orders;
CREATE POLICY "anon_delete_ticket_orders" ON ticket_orders FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  is_demo boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_messages_received_idx ON email_messages (received_at DESC);

ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_email_messages" ON email_messages;
CREATE POLICY "anon_select_email_messages" ON email_messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_email_messages" ON email_messages;
CREATE POLICY "anon_insert_email_messages" ON email_messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_email_messages" ON email_messages;
CREATE POLICY "anon_update_email_messages" ON email_messages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_email_messages" ON email_messages;
CREATE POLICY "anon_delete_email_messages" ON email_messages FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS location_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  session_id text NOT NULL DEFAULT 'waypoint-live',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS location_tracks_session_idx ON location_tracks (session_id, created_at DESC);

ALTER TABLE location_tracks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_location_tracks" ON location_tracks;
CREATE POLICY "anon_select_location_tracks" ON location_tracks FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_location_tracks" ON location_tracks;
CREATE POLICY "anon_insert_location_tracks" ON location_tracks FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_location_tracks" ON location_tracks;
CREATE POLICY "anon_update_location_tracks" ON location_tracks FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_location_tracks" ON location_tracks;
CREATE POLICY "anon_delete_location_tracks" ON location_tracks FOR DELETE
  TO anon, authenticated USING (true);
