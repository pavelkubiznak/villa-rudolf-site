-- Registrace hostů: datum narození nesmí dát věk přes 110 let
-- =====================================================================================
-- Proč: za správnost údajů v knize hostů ručí ubytovatel. Hosté zadávali správný den
-- a měsíc narození, ale rok dnešní nebo nesmyslný. Formulář /registrace/ to od 13. 10. 2026
-- hlídá sám (registrace/doklady.js: budoucnost a věk nad 110 let odmítne, na miminko se
-- zeptá); tahle migrace dává STEJNOU mez i do databáze, aby ji neobešla stará stránka
-- v mezipaměti telefonu ani přímé volání RPC.
--
-- Stav živé DB před migrací (ověřeno 13. 10. 2026 přes pg_get_functiondef):
--   _vr_persons_insert odmítá p_birth > current_date (budoucnost) a p_birth < 1900-01-01.
--   Rok 1900 = věk 126 let, takže překlep typu 1885 → 1905 nebo 1920 prošel.
-- Po migraci: budoucnost dál odmítnuta, spodní mez = dnes − 110 let (posouvá se sama).
--
-- Dotaz „opravdu je hostovi X měsíců?“ zůstává jen ve formuláři: databáze miminko od
-- překlepu nepozná a nový parametr by rozbil starou stránku v mezipaměti.
--
-- Jediná změna proti 20260923_vr_poplatek.sql je podmínka u birth_invalid. Signatura je
-- stejná → granty zůstávají, PostgREST nic nového nevidí (notify je jen pro jistotu).
-- Nasazení: workflow „DB migrace (Supabase)“ (nejdřív dry run), nebo
--   supabase db query --linked --file supabase/migrations/20261013_vr_persons_birth_limit.sql
-- =====================================================================================

create or replace function public._vr_persons_insert(
  p_booking   uuid,
  p_arrival   date,
  p_departure date,
  p_first     text,
  p_last      text,
  p_birth     date,
  p_cit       text,
  p_doc       text,
  p_city      text,
  p_rescnt    text,
  p_from      date,
  p_to        date,
  p_source    text,
  p_street    text default null,
  p_doc_type  text default null,
  p_exempt    text default null
) returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_doc    text := btrim(coalesce(p_doc, ''));
  v_street text := nullif(btrim(coalesce(p_street, '')), '');
  v_dtype  text := nullif(upper(btrim(coalesce(p_doc_type, ''))), '');
  v_exempt text := nullif(lower(btrim(coalesce(p_exempt, ''))), '');
  v_rescnt text := p_rescnt;
  v_adult  boolean;
  v_id     uuid;
begin
  if p_first = '' then return json_build_object('ok', false, 'error', 'first_required'); end if;
  if p_last  = '' then return json_build_object('ok', false, 'error', 'last_required');  end if;

  if char_length(p_first) > 100 or char_length(p_last) > 100
     or char_length(p_city) > 120 or char_length(v_doc) > 40
     or char_length(coalesce(v_street, '')) > 150 then
    return json_build_object('ok', false, 'error', 'too_long');
  end if;

  if p_cit !~ '^[A-Z]{2}$' then
    return json_build_object('ok', false, 'error', 'citizenship_invalid');
  end if;

  -- datum narození: povinné (§ 3g odst. 2 c), ne v budoucnosti a věk nejvýš 110 let
  -- (stejná mez jako MAX_AGE v registrace/doklady.js)
  if p_birth is null then
    return json_build_object('ok', false, 'error', 'birth_required');
  end if;
  if p_birth > current_date or p_birth < (current_date - interval '110 years')::date then
    return json_build_object('ok', false, 'error', 'birth_invalid');
  end if;

  -- pobyt: from <= to, v okně bookingu (arrival-1 .. departure+1)
  if p_from is null or p_to is null or p_from > p_to then
    return json_build_object('ok', false, 'error', 'dates_invalid');
  end if;
  if p_from < p_arrival - 1 or p_to > p_departure + 1 then
    return json_build_object('ok', false, 'error', 'out_of_window');
  end if;

  -- doklad: povinný u cizinců (UbyPort) a u dospělých (evidenční kniha § 3g)
  v_adult := p_birth <= (p_from - interval '18 years')::date;
  if (p_cit <> 'CZ' or v_adult) and v_doc = '' then
    return json_build_object('ok', false, 'error', 'doc_required');
  end if;
  if v_doc <> '' and v_doc !~ '^[A-Za-z0-9-]+$' then
    return json_build_object('ok', false, 'error', 'doc_invalid');
  end if;
  if v_dtype is not null and v_dtype not in ('ID', 'P', 'O') then
    return json_build_object('ok', false, 'error', 'doc_type_invalid');
  end if;

  -- host smí sám uvést jen ZTP/P (nevidomý, závislý na pomoci, průvodce);
  -- ostatní důvody zapisuje majitel ve /sprava/
  if v_exempt is not null and v_exempt <> 'ztp' then
    return json_build_object('ok', false, 'error', 'exempt_invalid');
  end if;

  if v_rescnt !~ '^[A-Z]{2}$' then v_rescnt := p_cit; end if;

  insert into public.vr_persons(
    booking_id, first_name, last_name, birth_date, citizenship, doc_number, doc_type,
    residence_street, residence_city, residence_country, stay_from, stay_to, source, fee_exempt)
  values (
    p_booking, p_first, p_last, p_birth, p_cit, nullif(v_doc, ''), case when v_doc = '' then null else v_dtype end,
    v_street, nullif(p_city, ''), v_rescnt, p_from, p_to, p_source, v_exempt)
  returning id into v_id;

  return json_build_object(
    'ok', true, 'id', v_id,
    'person', json_build_object(
      'id', v_id, 'first_name', p_first, 'last_name', p_last,
      'citizenship', p_cit, 'stay_from', p_from, 'stay_to', p_to,
      'doc_filled', (nullif(v_doc, '') is not null)));
end
$function$;

-- interní funkce zůstává bez grantu (volá ji jen vr_persons_add, DEFINER → DEFINER)
revoke all on function public._vr_persons_insert(uuid,date,date,text,text,date,text,text,text,text,date,date,text,text,text,text) from public, anon, authenticated;

notify pgrst, 'reload schema';
