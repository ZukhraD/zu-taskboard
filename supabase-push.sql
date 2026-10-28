-- Выполнить в Supabase → SQL Editor одним запросом (блоком).
do $$
begin
  create table if not exists public.push_subs (
    endpoint text primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    sub jsonb not null,
    lead_min int not null default 0,
    digest text not null default '',
    tz text not null default 'UTC',
    updated_at timestamptz not null default now()
  );
  alter table public.push_subs enable row level security;
  create policy "own subs select" on public.push_subs for select using (auth.uid() = user_id);
  create policy "own subs insert" on public.push_subs for insert with check (auth.uid() = user_id);
  create policy "own subs update" on public.push_subs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy "own subs delete" on public.push_subs for delete using (auth.uid() = user_id);

  create table if not exists public.push_log (
    user_id uuid not null references auth.users(id) on delete cascade,
    key text not null,
    at timestamptz not null default now(),
    primary key (user_id, key)
  );
  alter table public.push_log enable row level security;  -- политик нет: доступ только у сервера
end $$;
