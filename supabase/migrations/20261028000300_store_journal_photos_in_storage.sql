insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'story-journal-photos',
  'story-journal-photos',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id)
do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
    or octet_length(p_entries::text) > 1000000
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
