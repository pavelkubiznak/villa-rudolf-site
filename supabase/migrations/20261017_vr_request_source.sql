-- Villa Rudolf — odkud přišla poptávka z webu (vr_requests.source)
-- ============================================================================
-- Pavel chce vědět, jestli návštěvy z ChatGPT a jiných AI přinášejí objednávky (17. 10. 2026).
-- Umami dostává event „poptavka-odeslana" se zdrojem, ale k poptávce v DB se zdroj neukládal,
-- takže ve /sprava/ nebylo vidět, odkud host přišel.
-- Zdroj = vrZdroj() v assets/site.js: utm_source (ChatGPT přidává chatgpt.com), jinak doména
-- referreru (google.com…), jinak 'primo'. Žádné osobní údaje, jen název webu.
--
-- Nový parametr p_source mění podpis funkce → starý podpis se maže, jinak by vznikly dvě
-- přetížené funkce a PostgREST by volání nerozlišil. p_source má default, takže starý kód
-- webu (bez p_source, z cache prohlížeče) dál funguje.
-- POŘADÍ NASAZENÍ: nejdřív tahle migrace, pak teprve merge webu. Opačně by RPC s p_source
-- vracela 404 a poptávka by se neuložila.
-- Tělo vr_request převzaté z 20261009_vr_request_nl_fr.sql (shodné s živou DB 17. 10. 2026).
-- Aplikace: supabase db query --linked --file supabase/migrations/20261017_vr_request_source.sql

alter table public.vr_requests add column if not exists source text;

drop function if exists public.vr_request(date, date, integer, integer, text, text, text, text, jsonb, integer, text, integer);

create or replace function public.vr_request(p_arrival date, p_departure date, p_adults integer, p_children integer, p_name text, p_email text, p_phone text, p_lang text, p_breakdown jsonb, p_total integer, p_message text DEFAULT NULL::text, p_pets integer DEFAULT 0, p_source text DEFAULT NULL::text)
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
  -- zdroj návštěvy z webu (vrZdroj v assets/site.js): utm_source, doména referreru, nebo 'primo'
  v_source   text := left(lower(btrim(coalesce(p_source, ''))), 60);
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
    arrival, departure, adults, children, pets, name, email, phone, lang, breakdown, total, message, status, source)
  values (
    p_arrival, p_departure, v_adults, v_children, v_pets, v_name, v_email,
    nullif(v_phone, ''), v_lang, p_breakdown, nullif(v_total, 0), nullif(v_message, ''), 'new', nullif(v_source, ''))
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id);
end
$function$;

-- Granty jako u starého podpisu (živá DB 17. 10. 2026: anon, authenticated, service_role; bez PUBLIC).
revoke all on function public.vr_request(date, date, integer, integer, text, text, text, text, jsonb, integer, text, integer, text) from public;
grant execute on function public.vr_request(date, date, integer, integer, text, text, text, text, jsonb, integer, text, integer, text) to anon, authenticated, service_role;

-- /sprava/: seznam žádostí vrací i zdroj (tělo z 20260812_vr_requests_admin.sql, shodné s živou DB).
create or replace function public.vr_admin_list_requests(p_admin_key text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_rows json;
begin
  perform public._vr_admin_auth(p_admin_key);

  select coalesce(json_agg(row order by created_at desc), '[]'::json) into v_rows
  from (
    select json_build_object(
      'id', r.id,
      'created_at', r.created_at,
      'name', r.name,
      'email', r.email,
      'phone', r.phone,
      'lang', r.lang,
      'arrival', r.arrival,
      'departure', r.departure,
      'adults', r.adults,
      'children', r.children,
      'pets', r.pets,
      'total', r.total,
      'breakdown', r.breakdown,
      'message', r.message,
      'status', r.status,
      'notified_at', r.notified_at,
      'source', r.source
    ) as row, r.created_at
    from public.vr_requests r
  ) s;

  return json_build_object('ok', true, 'requests', v_rows);
end
$function$;

notify pgrst, 'reload schema';
