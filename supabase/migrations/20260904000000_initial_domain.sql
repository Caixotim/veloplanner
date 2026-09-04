create extension if not exists pgcrypto;

create table public.athlete_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'UTC',
  profile_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plans (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  goal text not null,
  start_date date not null,
  desired_weeks integer not null check (desired_weeks > 0),
  revision integer not null default 0 check (revision >= 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  plan_json jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index plans_one_active_per_user on public.plans (user_id) where status = 'active';
create index plans_user_updated_idx on public.plans (user_id, updated_at desc);

create table public.sessions (
  id text primary key,
  plan_id text not null references public.plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  session_json jsonb not null default '{}'::jsonb,
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create index sessions_plan_date_idx on public.sessions (plan_id, session_date);
alter table public.plans add constraint plans_id_user_unique unique (id, user_id);
alter table public.sessions add constraint sessions_plan_owner_fk foreign key (plan_id, user_id) references public.plans(id, user_id) on delete cascade;

create table public.sync_links (
  session_id text primary key references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  intervals_event_id text,
  intervals_external_id text,
  sync_hash text,
  last_synced_at timestamptz
);

create table public.intervals_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  athlete_id text not null,
  encrypted_access_token text not null,
  encrypted_refresh_token text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('intervals_rides', 'intervals_plan')),
  idempotency_key text not null,
  payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table public.sync_cursors (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('intervals')),
  cursor text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.athlete_profiles enable row level security;
alter table public.plans enable row level security;
alter table public.sessions enable row level security;
alter table public.sync_links enable row level security;
alter table public.intervals_connections enable row level security;
alter table public.sync_jobs enable row level security;
alter table public.sync_cursors enable row level security;

create policy athlete_profiles_owner on public.athlete_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy plans_owner on public.plans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy sessions_owner on public.sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy sync_links_owner on public.sync_links for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy intervals_connections_owner on public.intervals_connections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy sync_jobs_owner on public.sync_jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy sync_cursors_owner on public.sync_cursors for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger athlete_profiles_updated_at before update on public.athlete_profiles for each row execute function public.set_updated_at();
create trigger plans_updated_at before update on public.plans for each row execute function public.set_updated_at();
create trigger sessions_updated_at before update on public.sessions for each row execute function public.set_updated_at();
create trigger intervals_connections_updated_at before update on public.intervals_connections for each row execute function public.set_updated_at();
create trigger sync_jobs_updated_at before update on public.sync_jobs for each row execute function public.set_updated_at();
create trigger sync_cursors_updated_at before update on public.sync_cursors for each row execute function public.set_updated_at();
