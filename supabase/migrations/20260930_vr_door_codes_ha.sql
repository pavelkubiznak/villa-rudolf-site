-- Villa Rudolf — stav kódů v zámku Yale hlášený z Home Assistantu (30. 9. 2026)
--
-- HA ve vile zakládá kódy na klávesnici sám (vr_ha_door_codes → Seam, repo „jablotron -
-- topení", packages/zamek_kody.yaml). /sprava/ proto místo úkolu „Nastav v appce Yale
-- Home" ukazuje, co v zámku opravdu je. HA sem každých 30 min (a po každé změně) pošle
-- CELÝ seznam svých kódů — tabulka se přepíše, takže pobyt bez řádku = kód v zámku není.
-- Čas posledního hlášení je ve vr_admin_config (ha_door_codes_reported_at): když HA
-- mlčí, /sprava/ se vrátí ke starému úkolu.
--
-- HA posílá klíč v hlavičce X-Vr-Ha-Key (rest_command v HA neumí !secret v šabloně
-- těla). Klíč je stejný jako pro vr_ha_stay / vr_ha_door_codes (ha_key_sha256).

create table if not exists public.vr_door_codes_ha (
  uidh        text primary key,
  code        text,
  status      text,          -- stav v Seamu: set (v zámku) / unset (naplánováno) / setting / removing
  starts_at   timestamptz,
  ends_at     timestamptz,
  error       text,
  reported_at timestamptz not null default now()
);
alter table public.vr_door_codes_ha enable row level security;
revoke all on table public.vr_door_codes_ha from public, anon, authenticated;


create or replace function public.vr_ha_report_door_codes(p_codes json)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key    text;
  v_stored text;
  v_cnt    int;
begin
  select count(*) into v_cnt from public.vr_admin_rl where at > now() - interval '1 hour';
  if v_cnt >= 120 then
    raise exception 'rate_limited' using errcode = '53400';
  end if;
  insert into public.vr_admin_rl(at) values (now());

  v_key := coalesce(current_setting('request.headers', true)::json ->> 'x-vr-ha-key', '');
  select v into v_stored from public.vr_admin_config where k = 'ha_key_sha256';
  if char_length(v_key) < 32 or char_length(v_key) > 200 or v_stored is null
     or encode(extensions.digest(v_key, 'sha256'), 'hex') <> v_stored then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  if p_codes is null or json_typeof(p_codes) <> 'array' or json_array_length(p_codes) > 200 then
    raise exception 'bad_payload' using errcode = '22023';
  end if;

  delete from public.vr_door_codes_ha where true;
  insert into public.vr_door_codes_ha(uidh, code, status, starts_at, ends_at, error)
  select distinct on (e ->> 'uidh')
         e ->> 'uidh',
         left(e ->> 'code', 20),
         left(e ->> 'status', 20),
         nullif(e ->> 'starts_at', '')::timestamptz,
         nullif(e ->> 'ends_at', '')::timestamptz,
         left(nullif(e ->> 'error', ''), 300)
  from json_array_elements(p_codes) e
  where (e ->> 'uidh') ~ '^[0-9a-f]{16}$';
  get diagnostics v_cnt = row_count;

  update public.vr_admin_config set v = now()::text where k = 'ha_door_codes_reported_at';
  if not found then
    insert into public.vr_admin_config(k, v) values ('ha_door_codes_reported_at', now()::text);
  end if;

  return json_build_object('ok', true, 'count', v_cnt);
end
$function$;


create or replace function public.vr_admin_door_codes(p_admin_key text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public._vr_admin_auth(p_admin_key);
  return json_build_object(
    'ok', true,
    'reported_at', (select v from public.vr_admin_config where k = 'ha_door_codes_reported_at'),
    'codes', coalesce((
      select json_agg(json_build_object(
               'uidh', d.uidh, 'code', d.code, 'status', d.status,
               'starts_at', d.starts_at, 'ends_at', d.ends_at, 'error', d.error))
      from public.vr_door_codes_ha d), '[]'::json));
end
$function$;

revoke all on function public.vr_ha_report_door_codes(json) from public;
grant execute on function public.vr_ha_report_door_codes(json) to anon, authenticated;
revoke all on function public.vr_admin_door_codes(text) from public;
grant execute on function public.vr_admin_door_codes(text) to anon, authenticated;
