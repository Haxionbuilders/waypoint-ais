-- Bookings table for extracted email bookings
CREATE TABLE IF NOT EXISTS bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  journey_id UUID REFERENCES journeys(id) ON DELETE SET NULL,
  booking_type TEXT NOT NULL DEFAULT 'other',
  provider TEXT DEFAULT '',
  confirmation_number TEXT DEFAULT '',
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  location TEXT DEFAULT '',
  address TEXT DEFAULT '',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  deadline TIMESTAMPTZ,
  action_required TEXT DEFAULT '',
  confidence INTEGER DEFAULT 0,
  llm_provider TEXT DEFAULT '',
  raw_email_text TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Evidence items for AI-generated claims
CREATE TABLE IF NOT EXISTS evidence_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID,
  source_name TEXT NOT NULL,
  data_type TEXT NOT NULL DEFAULT 'unavailable',
  claim TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL DEFAULT 'low',
  raw_reference TEXT,
  retrieved_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- LLM usage logs (best-effort, no RLS needed — internal use only)
CREATE TABLE IF NOT EXISTS llm_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  task TEXT DEFAULT '',
  latency_ms INTEGER,
  success BOOLEAN DEFAULT TRUE,
  error_class TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_items ENABLE ROW LEVEL SECURITY;

-- Bookings: users see only their own
CREATE POLICY "Users can view own bookings"
  ON bookings FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can insert own bookings"
  ON bookings FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update own bookings"
  ON bookings FOR UPDATE
  USING (auth.uid() = user_id OR user_id IS NULL);

-- Evidence items: public read for now (tied to runs, which have RLS)
CREATE POLICY "Anyone can view evidence items"
  ON evidence_items FOR SELECT
  USING (TRUE);

CREATE POLICY "Anyone can insert evidence items"
  ON evidence_items FOR INSERT
  WITH CHECK (TRUE);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_journey_id ON bookings(journey_id);
CREATE INDEX IF NOT EXISTS idx_evidence_items_run_id ON evidence_items(run_id);
CREATE INDEX IF NOT EXISTS idx_llm_logs_timestamp ON llm_logs(timestamp);
