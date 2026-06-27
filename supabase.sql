create table if not exists public.ledger_sync (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.ledger_sync enable row level security;

drop policy if exists "ledger_sync_select" on public.ledger_sync;
drop policy if exists "ledger_sync_insert" on public.ledger_sync;
drop policy if exists "ledger_sync_update" on public.ledger_sync;
drop policy if exists "ledger_sync_delete" on public.ledger_sync;

create policy "ledger_sync_select"
on public.ledger_sync
for select
to authenticated
using (id = auth.uid()::text);

create policy "ledger_sync_insert"
on public.ledger_sync
for insert
to authenticated
with check (id = auth.uid()::text);

create policy "ledger_sync_update"
on public.ledger_sync
for update
to authenticated
using (id = auth.uid()::text)
with check (id = auth.uid()::text);

create policy "ledger_sync_delete"
on public.ledger_sync
for delete
to authenticated
using (id = auth.uid()::text);
