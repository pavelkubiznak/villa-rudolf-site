-- Villa Rudolf — anonymní počítání používání průvodce na TV (11. 10. 2026)
-- ============================================================================
-- Na dvou televizích ve vile běží průvodce pro hosty (villarudolf.com/tv/ ve WebView
-- aplikace cz.villarudolf.tv). Home Assistant vidí jen to, že je aplikace vpředu — ne,
-- které sekce si hosté otevřeli, ani jestli načetli QR kód. Majitel to chce vědět,
-- ale výslovně ANONYMNĚ: jen počty.
--
-- Co se ukládá: čas, typ události, sekce, jazyk. Nic dalšího — tabulka nemá sloupec na
-- IP, prohlížeč, zařízení, pobyt ani název výletu, a funkce si z požadavku nic takového
-- nečte. Kterou TV to bylo, odvodí HA sám z času (ví, na které TV byl průvodce vpředu).
--
--   typ          sekce                               kdo to posílá
--   sekce        home dum sauna bazen vylety         tv/tv.js — host na sekci zůstal ≥ 2 s
--                pocasi okoli mobil                   (návrat na úvod po nečinnosti se neposílá)
--   vylet        home vylety pocasi                  tv/tv.js — otevřen detail výletu (odkud, ne který)
--   qr_zobrazen  mobil vylet                         tv/tv.js — QR byl na obrazovce (sekce „Do mobilu“ / detail výletu)
--   qr_nacten    vylety info (vylet)                 assets/tv-qr.js — telefon otevřel /vylety/ nebo /info/ s ?tv
--                                                    („vylet“ zatím nikdo neposílá: je připravený pro QR v detailu
--                                                     výletu, kdyby se jednou vedl přes villarudolf.com — viz PR)
--
-- Zápis: jen přes vr_tv_event() (anon). Tabulka má RLS bez politik a odebraná práva,
-- takže přímo ji nečte ani nezapisuje nikdo. Neplatná kombinace se tiše zahodí (žádná
-- chybová hláška k ohmatávání) a nad 300 událostí za hodinu se zahazuje taky — dvě TV
-- tolik nevyrobí, je to jen strop proti zahlcení cizím skriptem.
--
-- Čtení: vr_ha_tv_stats() — stejný klíč jako vr_ha_stay (vr_admin_config.ha_key_sha256),
-- v hlavičce X-Vr-Ha-Key jako u vr_ha_report_door_codes (HA při chybě loguje tělo požadavku,
-- klíč v něm být nemá), nebo v p_key.
-- HA (repo „jablotron - topení“, packages/tv_vyuziti.yaml) volá každých 5 min. Úspěšné
-- volání se do vr_admin_rl nezapisuje, aby HA neujídal společný limit /sprava/ (120/h);
-- zapisuje se jen špatný klíč (odpověď {"error": "unauthorized"}, ne výjimka – ta by zápis
-- vrátila zpět), takže zkoušení klíče limit vyčerpá.

create table if not exists public.vr_tv_events (
  id    bigint generated always as identity primary key,
  at    timestamptz not null default now(),
  typ   text not null,
  sekce text not null,
  jazyk text not null,
  constraint vr_tv_events_typ_chk   check (typ in ('sekce', 'vylet', 'qr_zobrazen', 'qr_nacten')),
  constraint vr_tv_events_jazyk_chk check (jazyk in ('cs', 'de', 'en', 'pl'))
);
create index if not exists vr_tv_events_at_idx on public.vr_tv_events (at);

alter table public.vr_tv_events enable row level security;
revoke all on table public.vr_tv_events from public, anon, authenticated;


create or replace function public.vr_tv_event(p_typ text, p_sekce text, p_jazyk text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cnt int;
begin
  if p_jazyk is null or p_jazyk not in ('cs', 'de', 'en', 'pl') then
    return;
  end if;
  if not coalesce(
       (p_typ = 'sekce'       and p_sekce in ('home', 'dum', 'sauna', 'bazen', 'vylety', 'pocasi', 'okoli', 'mobil'))
    or (p_typ = 'vylet'       and p_sekce in ('home', 'vylety', 'pocasi'))
    or (p_typ = 'qr_zobrazen' and p_sekce in ('mobil', 'vylet'))
    or (p_typ = 'qr_nacten'   and p_sekce in ('vylety', 'info', 'vylet')), false) then
    return;
  end if;

  select count(*) into v_cnt from public.vr_tv_events where at > now() - interval '1 hour';
  if v_cnt >= 300 then
    return;
  end if;

  insert into public.vr_tv_events(typ, sekce, jazyk) values (p_typ, p_sekce, p_jazyk);
end
$function$;


-- p_od / p_do = období denních počtů (dny v českém čase, včetně obou krajů);
-- bez nich posledních 14 dní. HA posílá prázdné tělo a klíč v hlavičce.
create or replace function public.vr_ha_tv_stats(p_key text default null, p_od date default null, p_do date default null)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key    text := coalesce(nullif(p_key, ''),
                           current_setting('request.headers', true)::json ->> 'x-vr-ha-key', '');
  v_stored text;
  v_cnt    int;
  v_do     date := coalesce(p_do, (now() at time zone 'Europe/Prague')::date);
  v_od     date := coalesce(p_od, v_do - 13);
  v_dny    jsonb;
begin
  select count(*) into v_cnt from public.vr_admin_rl where at > now() - interval '1 hour';
  if v_cnt >= 120 then
    raise exception 'rate_limited' using errcode = '53400';
  end if;

  select v into v_stored from public.vr_admin_config where k = 'ha_key_sha256';
  if char_length(v_key) < 32 or char_length(v_key) > 200 or v_stored is null
     or encode(extensions.digest(v_key, 'sha256'), 'hex') <> v_stored then
    -- bez výjimky: ta by zápis do vr_admin_rl vrátila zpět a pokusy by se nepočítaly
    insert into public.vr_admin_rl(at) values (now());
    return json_build_object('error', 'unauthorized');
  end if;

  if v_od > v_do or v_do - v_od > 400 then
    raise exception 'bad_period' using errcode = '22023';
  end if;

  -- počty po dnech: {"2026-10-11": {"sekce": {"sauna": 3}, "vylet": {"vylety": 2},
  --                                 "qr_zobrazen": {"vylet": 2}, "qr_nacten": {"info": 1}, "jazyk": {"de": 8}}}
  with e as (
    select (at at time zone 'Europe/Prague')::date as den, typ, sekce, jazyk
    from public.vr_tv_events
    where at >= (v_od::timestamp at time zone 'Europe/Prague')
      and at <  ((v_do + 1)::timestamp at time zone 'Europe/Prague')
  ), ts as (
    select den, typ, jsonb_object_agg(sekce, n) as o
    from (select den, typ, sekce, count(*) as n from e group by den, typ, sekce) a
    group by den, typ
  ), t as (
    select den, jsonb_object_agg(typ, o) as o from ts group by den
  ), j as (
    select den, jsonb_object_agg(jazyk, n) as o
    from (select den, jazyk, count(*) as n from e group by den, jazyk) a
    group by den
  )
  select coalesce(jsonb_object_agg(t.den, t.o || jsonb_build_object('jazyk', j.o)), '{}'::jsonb)
    into v_dny
  from t join j using (den);

  return json_build_object(
    'od', v_od,
    'do', v_do,
    'posledni_id', coalesce((select max(id) from public.vr_tv_events), 0),
    'dny', v_dny,
    -- jednotlivé události posledních 48 h, [id, unix čas, typ, sekce]: podle času si HA
    -- přiřadí, na které TV byl zrovna průvodce vpředu (id = od které už je má zpracované)
    'posledni', coalesce((
      select json_agg(json_build_array(id, extract(epoch from at)::bigint, typ, sekce) order by id)
      from (select id, at, typ, sekce
            from public.vr_tv_events
            where at > now() - interval '48 hours'
            order by id desc
            limit 200) p), '[]'::json));
end
$function$;

revoke all on function public.vr_tv_event(text, text, text) from public;
grant execute on function public.vr_tv_event(text, text, text) to anon, authenticated;
revoke all on function public.vr_ha_tv_stats(text, date, date) from public;
grant execute on function public.vr_ha_tv_stats(text, date, date) to anon, authenticated;

notify pgrst, 'reload schema';
