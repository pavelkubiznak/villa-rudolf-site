-- Poznámka pro úklid v /sprava/ (28. 9. 2026) — navazuje na 20260928_vr_cleaning_note.sql
--
-- 1) vr_admin_list_bookings vrací i 'cleaning_note', ať ji /sprava/ ukáže a dá upravit.
--    Tělo = živá verze (ověřeno proti DB 28. 9. 2026, shodná s 20260915_vr_token_enc.sql),
--    přibyl jen ten jeden klíč. Podpis beze změny.
--
-- 2) vr_public_cleaning_notes vrací poznámku i pod uidh PŘEDREZERVACE. Přímý prodej
--    je v history.json kalendáře pod vr_hold_uidh(id), ne pod uidh pobytu — ten má
--    pobyt z /smlouvy/ a z „+ Předrezervace" prázdný (28. 9. 2026 oba živé přímé
--    prodeje). Bez toho by poznámka k přímému hostovi do kalendáře úklidu nikdy
--    nedošla. Párování je stejné jako bookingOfHold() v sprava.js: vazba booking_id
--    na tentýž termín, jinak JEDINÝ ruční pobyt „Přímá" bez uidh na přesně tentýž
--    termín, a jen když na ten termín není víc nepropojených předrezervací.
--    Pobyt s vlastním uidh se vrací i pod ním (ozvěna z platformy — kalendář nese
--    jen jeden z nich, druhý nic nespáruje).


-- ---------- 1) ADMIN: výpis rezervací + cleaning_note ----------
create or replace function public.vr_admin_list_bookings(p_admin_key text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_rows json;
begin
  perform public._vr_admin_auth(p_admin_key);

  select coalesce(json_agg(row order by arrival), '[]'::json) into v_rows
  from (
    select json_build_object(
      'id', b.id,
      'uidh', b.uidh,
      'first_name', b.first_name,
      'last_name', b.last_name,
      'phone', b.phone,
      'email', b.email,
      'lang', b.lang,
      'arrival', b.arrival,
      'departure', b.departure,
      'adults', b.adults,
      'children', b.children,
      'platform', b.platform,
      'notes', b.notes,
      'cleaning_note', b.cleaning_note,
      'door_code', b.door_code,
      'expires_at', b.expires_at,
      'created_at', b.created_at,
      'token', case when b.anonymized_at is null and (b.expires_at is null or b.expires_at > now())
                    then public._vr_token_dec(b.token_enc, p_admin_key) end,
      'persons', public._vr_booking_person_stats(b.id, b.arrival),
      'msglog', (
        select coalesce(json_agg(json_build_object('msg_key', m.msg_key, 'sent_at', m.sent_at)), '[]'::json)
        from public.vr_msglog m where m.booking_id = b.id)
    ) as row, b.arrival
    from public.vr_bookings b
  ) s;

  return json_build_object('ok', true, 'bookings', v_rows);
end
$function$;


-- ---------- 2) VEŘEJNÉ: poznámky pro kalendář úklidu, i u přímých prodejů ----------
-- Ven dál jen {uidh, note}.
create or replace function public.vr_public_cleaning_notes()
returns json
language sql
stable
security definer
set search_path to 'public'
as $function$
  with pozn as (
    select b.id, b.uidh, b.arrival, b.departure, b.cleaning_note as note
    from public.vr_bookings b
    where nullif(btrim(b.cleaning_note), '') is not null
      and b.departure >= current_date
  ),
  -- pobyt, na který odkazuje NĚJAKÁ předrezervace, patří jí (i s jiným termínem)
  propojene as (
    select distinct h.booking_id as id from public.vr_holds h where h.booking_id is not null
  ),
  otevrene as (
    select h.* from public.vr_holds h
    where h.status in ('hold','confirmed')
      and (h.status <> 'hold' or h.hold_until >= current_date)
  ),
  host_holdu as (
    select h.id as hold_id,
           case
             when h.booking_id is not null then
               (select b.id from public.vr_bookings b
                 where b.id = h.booking_id
                   and b.arrival = h.arrival and b.departure = h.departure)
             -- víc nepropojených předrezervací na tentýž termín = nehádat
             when (select count(*) from otevrene o
                    where o.booking_id is null
                      and o.arrival = h.arrival and o.departure = h.departure) > 1 then null
             else
               (select case when count(*) = 1 then (array_agg(b.id))[1] end
                  from public.vr_bookings b
                 where nullif(b.uidh, '') is null
                   and coalesce(nullif(b.platform, ''), 'Přímá') = 'Přímá'
                   and b.arrival = h.arrival and b.departure = h.departure
                   and b.id not in (select id from propojene))
           end as booking_id
    from otevrene h
  ),
  vazby as (
    select p.uidh, p.note, p.arrival from pozn p
    where nullif(p.uidh, '') is not null
    union
    select public.vr_hold_uidh(hh.hold_id), p.note, p.arrival
    from host_holdu hh join pozn p on p.id = hh.booking_id
  )
  select coalesce(json_agg(json_build_object(
           'uidh', v.uidh,
           'note', v.note
         ) order by v.arrival), '[]'::json)
  from vazby v;
$function$;


grant execute on function public.vr_public_cleaning_notes() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
