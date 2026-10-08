-- Villa Rudolf — poptávka z webu (vr_request) přijímá i nizozemštinu a francouzštinu
-- ============================================================================
-- Web má od 10/2026 statické verze /nl/ a /fr/ (tools/gen-jazyky.mjs). Formulář posílá p_lang
-- = jazyk stránky. Funkce dosud všechno mimo cs/de/en/pl přepisovala na 'cs', takže poptávka
-- Nizozemce by v /sprava/ i v e-mailu z n8n (VrWebRequest) tvrdila „vyplnil česky“.
-- Mění se jen seznam jazyků; tělo je jinak beze změny, převzaté z živé DB
-- (pg_get_functiondef 9. 10. 2026 — funkce v repu dosud nebyla). Podpis stejný → granty zůstávají.
-- Sloupec vr_requests.lang žádný CHECK nemá (ověřeno 9. 10. 2026).
-- Aplikace: supabase db query --linked --file supabase/migrations/20261009_vr_request_nl_fr.sql

create or replace function public.vr_request(p_arrival date, p_departure date, p_adults integer, p_children integer, p_name text, p_email text, p_phone text, p_lang text, p_breakdown jsonb, p_total integer, p_message text DEFAULT NULL::text, p_pets integer DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name     text := btrim(coalesce(p_name, ''));
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_phone    text := btrim(coalesce(p_phone, ''));
  v_lang     text := lower(btrim(coalesce(p_lang, '')));
  v_message  text := btrim(coalesce(p_message, ''));
  v_adults   int  := coalesce(p_adults, 0);
  v_children int  := coalesce(p_children, 0);
  v_pets     int  := coalesce(p_pets, 0);
  v_total    int  := coalesce(p_total, 0);
  v_id       uuid;
begin
  -- language normalization (site supports cs/de/en/pl, od 10/2026 i nl/fr — /nl/ a /fr/)
  if v_lang not in ('cs', 'de', 'en', 'pl', 'nl', 'fr') then v_lang := 'cs'; end if;

  -- required, non-empty
  if v_name  = '' then return json_build_object('ok', false, 'error', 'name_required');  end if;
  if v_email = '' then return json_build_object('ok', false, 'error', 'email_required'); end if;

  -- basic email shape
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return json_build_object('ok', false, 'error', 'email_invalid');
  end if;

  -- length caps
  if char_length(v_name) > 200 or char_length(v_email) > 200 or char_length(v_phone) > 200
     or char_length(v_lang) > 200 then
    return json_build_object('ok', false, 'error', 'too_long');
  end if;
  -- optional guest message: keep it, but cap length
  if char_length(v_message) > 2000 then
    return json_build_object('ok', false, 'error', 'message_too_long');
  end if;

  -- dates: arrival strictly before departure, and a sane maximum span
  if p_arrival is null or p_departure is null or p_arrival >= p_departure then
    return json_build_object('ok', false, 'error', 'dates_invalid');
  end if;
  if (p_departure - p_arrival) > 90 then
    return json_build_object('ok', false, 'error', 'dates_invalid');
  end if;

  -- guest caps (adults 1..22, children 0..21, total <= 22)
  if v_adults < 1 or v_adults > 22 then
    return json_build_object('ok', false, 'error', 'adults_invalid');
  end if;
  if v_children < 0 or v_children > 21 then
    return json_build_object('ok', false, 'error', 'children_invalid');
  end if;
  if (v_adults + v_children) > 22 then
    return json_build_object('ok', false, 'error', 'guests_invalid');
  end if;
  -- pets: 0..5 (poplatek 500 Kc za pobyt a zvire resi web)
  if v_pets < 0 or v_pets > 5 then
    return json_build_object('ok', false, 'error', 'pets_invalid');
  end if;

  -- rate-limit: >= 5 from same email in 24h
  if (select count(*) from public.vr_requests
        where email = v_email and created_at > now() - interval '24 hours') >= 5 then
    return json_build_object('ok', false, 'error', 'rate_limited');
  end if;
  -- rate-limit: >= 40 total in 24h
  if (select count(*) from public.vr_requests
        where created_at > now() - interval '24 hours') >= 40 then
    return json_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.vr_requests(
    arrival, departure, adults, children, pets, name, email, phone, lang, breakdown, total, message, status)
  values (
    p_arrival, p_departure, v_adults, v_children, v_pets, v_name, v_email,
    nullif(v_phone, ''), v_lang, p_breakdown, nullif(v_total, 0), nullif(v_message, ''), 'new')
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id);
end
$function$;

notify pgrst, 'reload schema';
