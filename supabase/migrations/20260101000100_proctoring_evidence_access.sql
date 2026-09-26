-- Audit trail for access to camera evidence.
-- Evidence is biometric-adjacent, so every administrator view of a snapshot or
-- clip is recorded. Kept separate from the artifacts themselves so a review log
-- can never be silently edited by the code path that reads evidence.
--
-- Note on ids: this table deliberately has no foreign keys. Assessment data is
-- still held in the application's own store, not in Supabase, so there is no
-- parent row to reference yet. An audit record must also outlive the entity it
-- describes, which rules out cascading deletes.

create table if not exists public.proctoring_evidence_access (
  id uuid primary key default gen_random_uuid(),
  attempt_id text not null,
  admin_id text not null,
  action text not null default 'view' check (action in ('view', 'play', 'download')),
  artifact_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists proctoring_evidence_access_attempt_idx
  on public.proctoring_evidence_access (attempt_id, created_at desc);

create index if not exists proctoring_evidence_access_admin_idx
  on public.proctoring_evidence_access (admin_id, created_at desc);

alter table public.proctoring_evidence_access enable row level security;

-- No policies on purpose: reads and writes go through the server's admin client,
-- which bypasses RLS, and only after requireAdmin() has authorised the caller.
--
-- The retention purge stays in 20260101000000_proctoring_artifacts.sql; extend
-- purge_expired_proctoring_artifacts() there if you want audit rows aged out too.
