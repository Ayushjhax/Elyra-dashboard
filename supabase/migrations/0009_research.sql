-- ---------------------------------------------------------------------------
-- Research reports.
--
-- ── One table, not a job queue ──────────────────────────────────────────
--
-- A row IS the job and, once finished, the report. Splitting them would mean
-- a two-phase write for every state change and a join for every read, to
-- model a lifecycle that is strictly linear: queued, running, done or failed.
--
-- `status` carries the lifecycle and `document` carries the result. A row
-- with status 'complete' and a null document is a bug, not a state.
--
-- ── Why the document is jsonb ───────────────────────────────────────────
--
-- The report is a typed tree of sections, metrics and sources that is
-- rendered to both HTML and PDF. Normalising it into tables would let the
-- database validate nothing useful — no constraint expresses "every metric
-- cites a source that exists" — while making the common read a five-way join.
-- The application verifies the structure before it is stored.
--
-- ── Ownership ───────────────────────────────────────────────────────────
--
-- Privy means auth.uid() is null, so RLS is on with no policies and every
-- query filters by user_id. A report contains a user's research; the download
-- path re-checks ownership rather than trusting an unguessable id.
--
-- Safe to run against a database that already has these.
-- ---------------------------------------------------------------------------

create table if not exists public.research_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,

  -- What was asked for, as typed. Kept so a failed report can be retried and
  -- so history reads like the user's own words rather than a parsed summary.
  query       text not null,
  kind        text not null check (kind in ('earnings', '10-K', '10-Q', 'custom')),

  -- Resolved subject. Null until the entity step succeeds, which is why a
  -- failed report can still say what it was looking for.
  subject_name   text,
  subject_ticker text,
  subject_cik    text,
  period_label   text,

  status      text not null default 'queued'
                check (status in ('queued','resolving','collecting','analyzing','rendering','complete','failed')),

  -- Written for a person. Shown while the job runs and after it fails.
  status_detail text,

  -- 'verified' | 'verified_with_warnings' | 'incomplete'. Null until complete.
  quality     text check (quality in ('verified','verified_with_warnings','incomplete')),

  -- The full ResearchReportDocument. Null until the document is built.
  document    jsonb,

  -- Object-storage path of the rendered PDF. Null until rendering succeeds,
  -- so a non-null value means a file that exists.
  pdf_path    text,
  pdf_bytes   integer,

  -- Why it failed. Null on success.
  error       text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists research_reports_user_idx
  on public.research_reports(user_id, created_at desc);

-- The worker scans this: anything still running.
create index if not exists research_reports_active_idx
  on public.research_reports(created_at)
  where status not in ('complete', 'failed');

alter table public.research_reports enable row level security;
