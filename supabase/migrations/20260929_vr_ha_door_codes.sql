-- Villa Rudolf — kódy od dveří pro Home Assistant (29. 9. 2026)
--
-- HA ve vile zakládá kódy na klávesnici zámku Yale přes Seam (repo „jablotron - topení",
-- balíček packages/zamek_kody.yaml). Dosud to majitel dělal ručně podle úkolu v /sprava/
-- („Nastav v appce Yale Home: kód …, platnost 15:00 – 10:00").
--
-- Na rozdíl od vr_ha_stay tahle funkce do HA posílá i TELEFON a KÓD OD DVEŘÍ — majitel
-- 29. 9. 2026 rozhodl, že je chce mít na kartě v HA a že HA má kódy zakládat sám.
-- E-mail, token ani nic dalšího z bookingu nechodí. Jen příjezdy na 14 dní dopředu
-- a běžící pobyty. Kód = stejný jako v /sprava/ (doorCodeFor) a na lednici:
-- vr_bookings.door_code, jinak posledních 5 číslic telefonu (_vr_booking_door_code).
-- Klíč je stejný jako pro vr_ha_stay (vr_admin_config.ha_key_sha256).

create or replace function public.vr_ha_door_codes(p_key text)
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

  return json_build_object(
    'today', v_today,
    'stays', coalesce((
      select json_agg(json_build_object(
               'uidh',       b.uidh,
               'arrival',    b.arrival,
               'departure',  b.departure,
               'first_name', b.first_name,
               'last_name',  b.last_name,
               'platform',   b.platform,
               'phone',      b.phone,
               'door_code',  public._vr_booking_door_code(b.door_code, b.phone))
             order by b.arrival)
      from public.vr_bookings b
      where b.anonymized_at is null
        and b.uidh is not null
        and b.departure >= v_today
        and b.arrival   <= v_today + 14
    ), '[]'::json));
end
$function$;

revoke all on function public.vr_ha_door_codes(text) from public;
grant execute on function public.vr_ha_door_codes(text) to anon, authenticated;
