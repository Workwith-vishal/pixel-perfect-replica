
create table if not exists public.proctoring_artifacts (
  id uuid primary key default gen_random_uuid(),
  attempt_id text not null,
  student_id text not null,
  assessment_id text,
  kind text not null check (kind in ('snapshot', 'clip')),
  -- Integrity event type that triggered a clip, or 'interval' for scheduled frames.
  reason text,
  storage_path text not null,
  mime_type text not null,
  byte_size integer not null default 0,
  captured_at timestamptz not null default now(),
  face_count integer,
  -- 0..1 heuristic attention score, null when the detector was unavailable.
  attention_score numeric(4, 3),
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '90 days'),
  created_at timestamptz not null default now(),
  constraint proctoring_artifacts_path_unique unique (storage_path)
);

create index if not exists proctoring_artifacts_attempt_captured_idx
  on public.proctoring_artifacts (attempt_id, captured_at desc);

create index if not exists proctoring_artifacts_expiry_idx
  on public.proctoring_artifacts (expires_at);

-- Locked down: no anon or authenticated policies, service role only.
alter table public.proctoring_artifacts enable row level security;

-- Private bucket for snapshots (image/jpeg) and short violation clips (video/webm).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'proctoring-media',
  'proctoring-media',
  false,
  10485760, -- 10 MB per object
  array['image/jpeg', 'video/webm']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Retention helper. Call from a scheduled edge function / pg_cron:
--   select public.purge_expired_proctoring_artifacts();
create or replace function public.purge_expired_proctoring_artifacts()
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  removed integer;
begin
  delete from storage.objects
  where bucket_id = 'proctoring-media'
    and exists (
      select 1
      from public.proctoring_artifacts a
      where a.storage_path = storage.objects.name
        and a.expires_at <= now()
    );

  delete from public.proctoring_artifacts where expires_at <= now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;
