create extension if not exists pgcrypto with schema extensions;

create table if not exists public.story_gate_config (
  id smallint primary key check (id = 1),
  code_hash text not null,
  success_message text not null
);

insert into public.story_gate_config (id, code_hash, success_message)
values (
  1,
  extensions.crypt('0922', extensions.gen_salt('bf')),
  'Code accepted. Welcome to our little story.'
)
on conflict (id) do nothing;

alter table public.story_gate_config enable row level security;
revoke all on table public.story_gate_config from public, anon, authenticated;

create table if not exists public.story_gate_attempts (
  client_key_hash text primary key check (client_key_hash ~ '^[a-f0-9]{64}$'),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  last_attempt_at timestamptz not null default now()
);

alter table public.story_gate_attempts enable row level security;
revoke all on table public.story_gate_attempts from public, anon, authenticated;

create or replace function public.verify_story_code(
  p_code text,
  p_client_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.story_gate_attempts%rowtype;
  v_code_hash text;
  v_success_message text;
  v_failed_attempts integer;
  v_locked_until timestamptz;
begin
  if p_code is null
    or p_code !~ '^[0-9]{4}$'
    or p_client_key_hash is null
    or p_client_key_hash !~ '^[a-f0-9]{64}$'
  then
    return jsonb_build_object(
      'ok', false,
      'kind', 'invalid_request',
      'message', 'Enter a valid four-digit code.'
    );
  end if;

  insert into public.story_gate_attempts (client_key_hash)
  values (p_client_key_hash)
  on conflict (client_key_hash) do nothing;

  select *
    into v_attempt
    from public.story_gate_attempts
   where client_key_hash = p_client_key_hash
   for update;

  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return jsonb_build_object(
      'ok', false,
      'kind', 'rate_limited',
      'message', 'Too many attempts. Please try again later.',
      'retry_after_seconds',
      ceil(extract(epoch from (v_attempt.locked_until - now())))::integer
    );
  end if;

  select code_hash, success_message
    into v_code_hash, v_success_message
    from public.story_gate_config
   where id = 1;

  if v_code_hash is null then
    raise exception 'Secret code configuration is missing';
  end if;

  if extensions.crypt(p_code, v_code_hash) = v_code_hash then
    delete from public.story_gate_attempts
     where client_key_hash = p_client_key_hash;

    return jsonb_build_object(
      'ok', true,
      'message', v_success_message
    );
  end if;

  v_failed_attempts := case
    when v_attempt.locked_until is not null then 0
    else v_attempt.failed_attempts
  end + 1;
  v_locked_until := case
    when v_failed_attempts >= 5 then now() + interval '15 minutes'
    else null
  end;

  update public.story_gate_attempts
     set failed_attempts = v_failed_attempts,
         locked_until = v_locked_until,
         last_attempt_at = now()
   where client_key_hash = p_client_key_hash;

  if v_locked_until is not null then
    return jsonb_build_object(
      'ok', false,
      'kind', 'rate_limited',
      'message', 'Too many attempts. Please try again later.',
      'retry_after_seconds', 900
    );
  end if;

  return jsonb_build_object(
    'ok', false,
    'kind', 'wrong_code',
    'message', 'That is not quite it. Try the month we began.'
  );
end;
$$;

revoke all on function public.verify_story_code(text, text) from public, anon, authenticated;
grant execute on function public.verify_story_code(text, text) to service_role;
