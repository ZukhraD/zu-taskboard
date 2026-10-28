-- Supabase → SQL Editor. Редактор принимает один запрос за раз: вставляйте и запускайте по очереди.

-- 1
create table if not exists public.push_subs (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  sub jsonb not null,
  lead_min int not null default 0,
  digest text not null default '',
  tz text not null default 'UTC',
  updated_at timestamptz not null default now()
);

-- 2
alter table public.push_subs enable row level security;

-- 3
create policy "own subs" on public.push_subs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4
create table if not exists public.push_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  at timestamptz not null default now(),
  primary key (user_id, key)
);

-- 5 (политик нет: доступ только у сервера)
alter table public.push_log enable row level security;
