-- 1) llm_logs is written only by Edge Functions (service role bypasses RLS).
--    Enabling RLS with no policies hides it from the public API.
ALTER TABLE IF EXISTS public.llm_logs ENABLE ROW LEVEL SECURITY;

-- 2) "Auth RLS Initialization Plan": wrap auth.uid() in a sub-select so Postgres
--    evaluates it once per query instead of once per row. Rewrites every public policy.
DO $$
DECLARE
  pol record;
  new_using text;
  new_check text;
  stmt text;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') ~ 'auth\.uid\(\)' OR coalesce(with_check, '') ~ 'auth\.uid\(\)')
      AND coalesce(qual, '') !~* 'select auth\.uid\(\)'
      AND coalesce(with_check, '') !~* 'select auth\.uid\(\)'
  LOOP
    new_using := regexp_replace(pol.qual, 'auth\.uid\(\)', '(select auth.uid())', 'g');
    new_check := regexp_replace(pol.with_check, 'auth\.uid\(\)', '(select auth.uid())', 'g');
    stmt := format('ALTER POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    IF new_using IS NOT NULL THEN stmt := stmt || format(' USING (%s)', new_using); END IF;
    IF new_check IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', new_check); END IF;
    EXECUTE stmt;
  END LOOP;
END $$;
