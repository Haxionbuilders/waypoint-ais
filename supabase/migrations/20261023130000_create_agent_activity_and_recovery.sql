/*
# Agent Activity Logging & Trip Recovery Schema

1. Schema Updates:
  - Add `status` column to `journeys` table ('scheduled', 'active', 'recovering', 'completed', 'cancelled')
  - Create `agent_runs` table:
    - `id` (uuid PK)
    - `user_id` (uuid FK to auth.users, cascade delete)
    - `goal` (text, e.g. "Trip Recovery: Kochi to Munnar", "Emergency Delay Check")
    - `status` (text: 'running', 'completed', 'failed', 'recovering')
    - `started_at` (timestamptz)
    - `finished_at` (timestamptz)
    - `provider` (text, e.g. 'gemini', 'groq', 'deterministic')
    - `model` (text)
    - `error` (text)
    - `created_at` (timestamptz)
  - Create `agent_steps` table:
    - `id` (uuid PK)
    - `run_id` (uuid FK to agent_runs, cascade delete)
    - `sequence` (integer)
    - `name` (text: 'Understanding request', 'Finding destination', 'Checking weather', 'Estimating route', 'Checking disruptions', 'Comparing options', 'Preparing recommendation', 'Drafting message', 'Waiting for approval')
    - `status` (text: 'pending', 'running', 'completed', 'failed', 'skipped')
    - `result` (text)
    - `error` (text)
    - `started_at` (timestamptz)
    - `finished_at` (timestamptz)

2. Row Level Security:
  - User-scoped RLS policies on both tables.
  - Authenticated users access their own runs (`auth.uid() = user_id`).
  - Anonymous / Guest users access demo runs where `user_id IS NULL`.
*/

-- 1. Add status column to journeys
ALTER TABLE journeys
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled';

-- 2. Create agent_runs table
CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  goal text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  provider text DEFAULT 'gemini',
  model text DEFAULT 'gemini-1.5-flash',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_runs_user_idx ON agent_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_status_idx ON agent_runs (status);

-- 3. Create agent_steps table
CREATE TABLE IF NOT EXISTS agent_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  result text,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS agent_steps_run_idx ON agent_steps (run_id, sequence ASC);

-- 4. Enable Row Level Security
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_steps ENABLE ROW LEVEL SECURITY;

-- 5. Policies for agent_runs
DROP POLICY IF EXISTS "user_select_agent_runs" ON agent_runs;
CREATE POLICY "user_select_agent_runs" ON agent_runs FOR SELECT
  TO anon, authenticated
  USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR (auth.uid() IS NULL AND user_id IS NULL)
  );

DROP POLICY IF EXISTS "user_insert_agent_runs" ON agent_runs;
CREATE POLICY "user_insert_agent_runs" ON agent_runs FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    (auth.uid() IS NOT NULL AND (auth.uid() = user_id OR user_id IS NULL))
    OR (auth.uid() IS NULL AND user_id IS NULL)
  );

DROP POLICY IF EXISTS "user_update_agent_runs" ON agent_runs;
CREATE POLICY "user_update_agent_runs" ON agent_runs FOR UPDATE
  TO anon, authenticated
  USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR (auth.uid() IS NULL AND user_id IS NULL)
  );

DROP POLICY IF EXISTS "user_delete_agent_runs" ON agent_runs;
CREATE POLICY "user_delete_agent_runs" ON agent_runs FOR DELETE
  TO anon, authenticated
  USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR (auth.uid() IS NULL AND user_id IS NULL)
  );

-- 6. Policies for agent_steps
DROP POLICY IF EXISTS "user_select_agent_steps" ON agent_steps;
CREATE POLICY "user_select_agent_steps" ON agent_steps FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agent_runs r
      WHERE r.id = agent_steps.run_id
      AND (
        (auth.uid() IS NOT NULL AND auth.uid() = r.user_id)
        OR (auth.uid() IS NULL AND r.user_id IS NULL)
      )
    )
  );

DROP POLICY IF EXISTS "user_insert_agent_steps" ON agent_steps;
CREATE POLICY "user_insert_agent_steps" ON agent_steps FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agent_runs r
      WHERE r.id = agent_steps.run_id
      AND (
        (auth.uid() IS NOT NULL AND (auth.uid() = r.user_id OR r.user_id IS NULL))
        OR (auth.uid() IS NULL AND r.user_id IS NULL)
      )
    )
  );

DROP POLICY IF EXISTS "user_update_agent_steps" ON agent_steps;
CREATE POLICY "user_update_agent_steps" ON agent_steps FOR UPDATE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agent_runs r
      WHERE r.id = agent_steps.run_id
      AND (
        (auth.uid() IS NOT NULL AND auth.uid() = r.user_id)
        OR (auth.uid() IS NULL AND r.user_id IS NULL)
      )
    )
  );

DROP POLICY IF EXISTS "user_delete_agent_steps" ON agent_steps;
CREATE POLICY "user_delete_agent_steps" ON agent_steps FOR DELETE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agent_runs r
      WHERE r.id = agent_steps.run_id
      AND (
        (auth.uid() IS NOT NULL AND auth.uid() = r.user_id)
        OR (auth.uid() IS NULL AND r.user_id IS NULL)
      )
    )
  );
