-- Villa Rudolf — úzký výdej pobytu pro Home Assistant na vile
-- ============================================================================
-- HA (HA Green ve vile, repo „jablotron - topení") potřebuje k uvítání na televizi
-- vědět, kdo zrovna bydlí: křestní jméno, příjmení, jazyk a počet osob. Víc nic —
-- telefon, e-mail, kód od dveří ani token do HA nechodí. Jazyk se bere přednostně
-- z předvolby telefonu (lang ve vr_bookings má výchozí 'de' a často zůstane
-- nevyplněný), jinak z lang.
--
-- Autorizace: vlastní klíč HA, v DB jen jeho sha256 pod vr_admin_config.ha_key_sha256
-- (stejný vzor jako admin_key_sha256). Klíč vzniká mimo repo a leží jen v secrets.yaml
-- v HA. Rate-limit sdílí vr_admin_rl s admin klíčem; HA volá ~2× za hodinu.
--
-- Storno tabulka vr_bookings nezná (pozná se jen z feedu kalendáře), proto HA
-- bere termín z feedu a odsud jen doplňuje jméno a jazyk k pobytu ve stejném termínu.

create or replace function public._vr_lang_from_phone(p_phone text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  with n as (
    select case
      when t like '+%'  then substr(t, 2)
      when t like '00%' then substr(t, 3)
      when char_length(t) = 9 then '420' || t      -- český mobil bez předvolby
      else null
    end as d
    from (select regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g') as t) s
  )
  select case
    when d is null or d = ''                      then null
    when d like '420%'                            then 'cs'
    when d like '421%'                            then 'sk'
    when d like '48%'                             then 'pl'
    when d like '49%' or d like '43%'
      or d like '41%' or d like '423%'            then 'de'
    when d like '31%'                             then 'nl'
    else 'en'
  end
  from n;
$function$;


create or replace function public.vr_ha_stay(p_key text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key    text := coalesce(p_key, '');
  v_stored text;
  v_cnt    int;
  v_today  date := (now() at time zone 'Europe/Prague')::date;
begin
  select count(*) into v_cnt from public.vr_admin_rl where at > now() - interval '1 hour';
  if v_cnt >= 120 then
    raise exception 'rate_limited' using errcode = '53400';
  end if;
  insert into public.vr_admin_rl(at) values (now());

  select v into v_stored from public.vr_admin_config where k = 'ha_key_sha256';
  if char_length(v_key) < 32 or char_length(v_key) > 200 or v_stored is null
     or encode(extensions.digest(v_key, 'sha256'), 'hex') <> v_stored then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  -- běžící pobyt a zítřejší příjezd (HA si ráno připraví uvítání)
  return json_build_object(
    'today', v_today,
    'stays', coalesce((
      select json_agg(json_build_object(
               'uidh',       b.uidh,
               'arrival',    b.arrival,
               'departure',  b.departure,
               'first_name', b.first_name,
               'last_name',  b.last_name,
               'lang',       b.lang,
               'lang_tel',   public._vr_lang_from_phone(b.phone),
               'adults',     b.adults,
               'kids',       coalesce(cardinality(b.children), 0))
             order by b.arrival)
      from public.vr_bookings b
      where b.anonymized_at is null
        and b.departure >= v_today
        and b.arrival   <= v_today + 1
    ), '[]'::json));
end
$function$;

revoke all on function public._vr_lang_from_phone(text) from public, anon, authenticated;
revoke all on function public.vr_ha_stay(text) from public;
grant execute on function public.vr_ha_stay(text) to anon, authenticated;

notify pgrst, 'reload schema';
