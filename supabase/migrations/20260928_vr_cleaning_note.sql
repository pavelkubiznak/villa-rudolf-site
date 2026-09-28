-- Poznámka pro úklid (28. 9. 2026)
--
-- Přání hosta, které musí vědět úklid: dětská postýlka, dřívější příjezd, přistýlky…
-- Dřív to žilo jen v hlavě majitele a úklid se to dozvěděl, když se nezapomnělo.
-- Teď se to píše k rezervaci a kalendář úklidu (villa-booking-calendar, index.html)
-- to ukáže u dne příjezdu i v seznamu nadcházejících pobytů.
--
-- ⚠️ cleaning_note je VEŘEJNÁ: kalendář úklidu nemá přihlášení a čte ji přes anon
-- funkci vr_public_cleaning_notes(). Nepiš do ní jméno, telefon, kódy ani nic,
-- co by nesnesl nástěnku v chodbě. Jen co má úklid udělat.
-- Interní poznámky majitele patří dál do `notes` (ta ven nikdy nejde).

alter table public.vr_bookings add column if not exists cleaning_note text;

comment on column public.vr_bookings.cleaning_note is
  'Pokyn pro úklid (postýlka, dřívější příjezd…). VEŘEJNÉ přes vr_public_cleaning_notes() — žádné osobní údaje.';


-- ---------- VEŘEJNÉ: poznámky pro kalendář úklidu ----------
-- Vrací jen {uidh, note}. uidh je spojka na pobyt v history.json kalendáře
-- (= sha256(iCal UID)[:16]), nic dalšího o hostovi se ven nedostane.
-- Proběhlé pobyty se nevrací — úklid potřebuje jen to, co ho čeká.
create or replace function public.vr_public_cleaning_notes()
returns json
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(json_agg(json_build_object(
           'uidh', b.uidh,
           'note', b.cleaning_note
         ) order by b.arrival), '[]'::json)
  from public.vr_bookings b
  where b.uidh is not null
    and nullif(btrim(b.cleaning_note), '') is not null
    and b.departure >= current_date;
$function$;


-- ---------- ADMIN: zápis poznámky ----------
-- Samostatná funkce, ať se kvůli jednomu poli nemění podpis vr_admin_upsert_booking.
-- Prázdný text poznámku smaže.
create or replace function public.vr_admin_set_cleaning_note(
  p_admin_key text,
  p_id        uuid,
  p_note      text
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public._vr_admin_auth(p_admin_key);
  if v_note is not null and length(v_note) > 500 then
    raise exception 'Poznámka pro úklid je delší než 500 znaků';
  end if;
  update public.vr_bookings set cleaning_note = v_note where id = p_id;
  if not found then raise exception 'Rezervace nenalezena'; end if;
  return json_build_object('id', p_id, 'cleaning_note', v_note);
end;
$function$;


grant execute on function public.vr_public_cleaning_notes() to anon, authenticated, service_role;
grant execute on function public.vr_admin_set_cleaning_note(text, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
