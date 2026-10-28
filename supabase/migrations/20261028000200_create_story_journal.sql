create table if not exists public.story_journal_entries (
  collection text not null check (collection in ('map', 'match', 'cafe')),
  id text not null check (length(id) between 1 and 80),
  entry jsonb not null check (jsonb_typeof(entry) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

create table if not exists public.story_journal_collections (
  collection text primary key check (collection in ('map', 'match', 'cafe')),
  updated_at timestamptz not null default now()
);

alter table public.story_journal_entries enable row level security;
alter table public.story_journal_collections enable row level security;
revoke all on table public.story_journal_entries from public, anon, authenticated;
revoke all on table public.story_journal_collections from public, anon, authenticated;
grant select, insert, update, delete on table public.story_journal_entries to service_role;
grant select, insert, update, delete on table public.story_journal_collections to service_role;

create or replace function public.replace_story_journal(
  p_collection text,
  p_entries jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_collection not in ('map', 'match', 'cafe') then
    raise exception 'Unknown journal collection';
  end if;

  if p_entries is null
    or jsonb_typeof(p_entries) <> 'array'
    or jsonb_array_length(p_entries) > 100
    or octet_length(p_entries::text) > 3500000
  then
    raise exception 'Journal data is invalid or too large';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_entries) as items(entry)
     where jsonb_typeof(items.entry) <> 'object'
        or coalesce(items.entry ->> 'id', '') = ''
        or length(items.entry ->> 'id') > 80
  ) then
    raise exception 'Every journal entry must have a valid ID';
  end if;

  if (
    select count(*) <> count(distinct items.entry ->> 'id')
      from jsonb_array_elements(p_entries) as items(entry)
  ) then
    raise exception 'Journal entry IDs must be unique';
  end if;

  delete from public.story_journal_entries
   where collection = p_collection;

  insert into public.story_journal_collections (collection, updated_at)
  values (p_collection, now())
  on conflict (collection)
  do update set updated_at = excluded.updated_at;

  insert into public.story_journal_entries (collection, id, entry, updated_at)
  select p_collection, items.entry ->> 'id', items.entry, now()
    from jsonb_array_elements(p_entries) as items(entry);
end;
$$;

revoke all on function public.replace_story_journal(text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_story_journal(text, jsonb) to service_role;

create or replace function public.read_story_journal(p_collection text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entries jsonb;
begin
  if p_collection not in ('map', 'match', 'cafe') then
    raise exception 'Unknown journal collection';
  end if;

  if not exists (
    select 1
      from public.story_journal_collections
     where collection = p_collection
  ) then
    return null;
  end if;

  select coalesce(jsonb_agg(entry order by updated_at asc), '[]'::jsonb)
    into v_entries
    from public.story_journal_entries
   where collection = p_collection;

  return v_entries;
end;
$$;

revoke all on function public.read_story_journal(text) from public, anon, authenticated;
grant execute on function public.read_story_journal(text) to service_role;
