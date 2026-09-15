-- ═══════════════════════════════════════════════════════════════════════════════
-- Migrace 2026-09-15 — odkaz hosta dostupný na každém zařízení (token_enc)
--
-- Proč: vr_admin_upsert_booking vracela surový token JEDNOU a /sprava/ si ho držela
-- jen v sessionStorage jedné karty. Po zavření karty odkaz na /pruvodce/ a /registrace/
-- zmizel a jediná cesta byla „Vygenerovat nový odkaz" — což zneplatnilo odkaz, který
-- už host třeba dostal. Uvítací zpráva (T−7) navíc odkaz na průvodce vůbec neposílala.
--
-- Řešení: surový token se uloží zašifrovaný ADMIN KLÍČEM (pgp_sym_encrypt). Databáze
-- sama ho přečíst neumí — dešifruje se jen při volání vr_admin_list_bookings, kam
-- majitel klíč posílá tak jako tak. Kdo má admin klíč, mohl už dřív token regenerovat
-- a číst PII, takže se tím žádná nová pravomoc nepřidává. token_hash zůstává jediným
-- ověřovacím údajem pro hosta (vr_verify_token se nemění).
--
-- Pobyty založené před migrací token_enc nemají → /sprava/ u nich dál nabízí
-- „Vygenerovat nový odkaz"; od té chvíle je odkaz trvalý.
--
-- Nasazení: supabase db query --linked --file …; pak notify pgrst, 'reload schema'.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.vr_bookings
  add column if not exists token_enc bytea;

-- Dešifrování, které nikdy neshodí celý výpis: špatný klíč (po rotaci admin klíče)
-- nebo poškozená data → null, ne výjimka.
create or replace function public._vr_token_dec(p_enc bytea, p_key text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
begin
  if p_enc is null or p_key is null then return null; end if;
  return extensions.pgp_sym_decrypt(p_enc, p_key);
exception when others then
  return null;
end
$$;
revoke all on function public._vr_token_dec(bytea, text) from public, anon, authenticated;

-- vr_admin_list_bookings: + 'token' (jen u živého, neanonymizovaného pobytu)
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

-- vr_admin_upsert_booking: stejné tělo jako živá verze (ověřeno proti DB 15. 9. 2026),
-- navíc ukládá token_enc při založení i při regeneraci.
create or replace function public.vr_admin_upsert_booking(
  p_admin_key   text,
  p_id          uuid,
  p_uidh        text,
  p_first       text,
  p_last        text,
  p_phone       text,
  p_email       text,
  p_lang        text,
  p_arrival     date,
  p_departure   date,
  p_adults      int,
  p_children    int[],
  p_platform    text,
  p_notes       text,
  p_door_code   text,
  p_regen_token boolean default false
) returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_first   text := btrim(coalesce(p_first, ''));
  v_last    text := btrim(coalesce(p_last, ''));
  v_phone   text := btrim(coalesce(p_phone, ''));
  v_email   text := btrim(coalesce(p_email, ''));
  v_lang    text := lower(btrim(coalesce(p_lang, 'cs')));
  v_uidh    text := nullif(btrim(coalesce(p_uidh, '')), '');
  v_plat    text := nullif(btrim(coalesce(p_platform, '')), '');
  v_notes   text := nullif(btrim(coalesce(p_notes, '')), '');
  v_door    text := nullif(btrim(coalesce(p_door_code, '')), '');
  v_adults  int  := coalesce(p_adults, 2);
  v_kids    int[]:= coalesce(p_children, '{}'::int[]);
  v_expires timestamptz;
  v_token   text := null;
  v_hash    text;
  v_enc     bytea := null;
  v_id      uuid := p_id;
  v_existing record;
begin
  perform public._vr_admin_auth(p_admin_key);

  if v_lang not in ('cs','en','de','pl') then v_lang := 'cs'; end if;
  if p_arrival is null or p_departure is null or p_arrival > p_departure then
    return json_build_object('ok', false, 'error', 'dates_invalid');
  end if;
  if char_length(v_first) > 100 or char_length(v_last) > 100
     or char_length(v_phone) > 40 or char_length(v_email) > 160 then
    return json_build_object('ok', false, 'error', 'too_long');
  end if;
  v_expires := (p_departure + interval '14 days');

  -- uidh nesmí patřit jinému pobytu
  if v_uidh is not null then
    if exists (select 1 from public.vr_bookings
                where uidh = v_uidh and (v_id is null or id <> v_id)) then
      return json_build_object('ok', false, 'error', 'uidh_taken');
    end if;
  end if;

  if v_id is null then
    -- NOVÝ pobyt: vygeneruj token hosta (48 hex znaků, vysoká entropie)
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');
    v_enc   := extensions.pgp_sym_encrypt(v_token, p_admin_key);
    insert into public.vr_bookings(
      token_hash, token_enc, first_name, last_name, lang, arrival, departure,
      adults, children, notes, expires_at, uidh, phone, email, platform, door_code)
    values (
      v_hash, v_enc, nullif(v_first,''), nullif(v_last,''), v_lang, p_arrival, p_departure,
      v_adults, v_kids, v_notes, v_expires, v_uidh,
      nullif(v_phone,''), nullif(v_email,''), v_plat, v_door)
    returning id into v_id;
  else
    -- ÚPRAVA
    select * into v_existing from public.vr_bookings where id = v_id;
    if v_existing.id is null then
      return json_build_object('ok', false, 'error', 'not_found');
    end if;
    if p_regen_token then
      v_token := encode(extensions.gen_random_bytes(24), 'hex');
      v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');
      v_enc   := extensions.pgp_sym_encrypt(v_token, p_admin_key);
    end if;
    update public.vr_bookings set
      first_name = nullif(v_first,''),
      last_name  = nullif(v_last,''),
      lang       = v_lang,
      arrival    = p_arrival,
      departure  = p_departure,
      adults     = v_adults,
      children   = v_kids,
      notes      = v_notes,
      expires_at = v_expires,
      uidh       = v_uidh,
      phone      = nullif(v_phone,''),
      email      = nullif(v_email,''),
      platform   = v_plat,
      door_code  = v_door,
      token_hash = coalesce(v_hash, token_hash),
      token_enc  = coalesce(v_enc, token_enc)
    where id = v_id;
  end if;

  return json_build_object(
    'ok', true,
    'id', v_id,
    'token', v_token,   -- NULL při úpravě bez regenerace; jinak plaintext (od teď i v token_enc)
    'expires_at', v_expires);
end
$function$;
