-- Async Slides export jobs (SPEC.md §4 Export): POST /export/slides returns
-- 202 {job_id}; processing happens in-process (same pattern as ingestion_jobs)
-- and is polled via GET /export/jobs/:id. The Google OAuth access token is
-- NEVER stored here: it travels in memory only.
CREATE TABLE IF NOT EXISTS export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  target_id uuid NOT NULL,
  target_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  presentation_id text,
  url text,
  warnings jsonb NOT NULL DEFAULT '[]',
  error text,
  requested_by uuid,
  include jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- Repository listing: newest first, filtered by kind / target_name.
CREATE INDEX IF NOT EXISTS export_jobs_created_idx ON export_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS export_jobs_kind_idx ON export_jobs (kind);
