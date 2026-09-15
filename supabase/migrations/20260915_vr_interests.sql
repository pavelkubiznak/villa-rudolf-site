-- ═══════════════════════════════════════════════════════════════════════════════
-- Migrace 2026-08-13 — zájmový profil party (interests)
--
-- Proč: portál uměl rozlišit hosty jen podle věku dětí. Parta bez dětí (například
-- motorkáři) dostala rodinný portál. Nová osa `interests` řídí doporučení
-- a zároveň oslovení v hlavičce.
--
-- ⚠️ POŘADÍ NASAZENÍ NEHRAJE ROLI — migrace je záměrně zpětně kompatibilní:
--    stará tříparametrová funkce ZŮSTÁVÁ. Klienti, kterým service worker drží
--    starou verzi index.html, volají dál tři parametry a ukládání jim funguje;
--    noví volají čtyři. Proto nová funkce NEMÁ default u p_interests — s defaultem
--    by tříparametrové volání bylo mezi oběma funkcemi nejednoznačné a spadlo by.
--
-- Původ: villa-rudolf-portal/supabase/2026-08-13-interests.sql. Aplikováno 15. 9. 2026 přes
-- `supabase db query --linked --file` (do té doby portál běžel s fallbackem na 3 parametry).
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.vr_bookings
  add column if not exists interests text[] default '{}';

-- vr_verify_token: stejná signatura, jen do party přibude interests.
create or replace function public.vr_verify_token(p_token text)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'name', json_build_object('first', b.first_name, 'last', b.last_name),
    'lang', b.lang,
    'arrival', b.arrival,
    'departure', b.departure,
    'party', json_build_object('adults', b.adults, 'children', b.children,
                               'interests', coalesce(b.interests, '{}')),
    'notes', b.notes
  )
  from public.vr_bookings b
  where b.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and (b.expires_at is null or b.expires_at > now())
  limit 1;
$$;

-- vr_update_party: NOVÁ čtyřparametrová varianta vedle staré, ne místo ní.
-- Whitelist zájmů je i tady — klientovi se nevěří.
create or replace function public.vr_update_party(
  p_token text, p_adults int, p_children int[], p_interests text[])
returns json
language sql
security definer
set search_path = public
as $$
  update public.vr_bookings b
     set adults = coalesce(least(greatest(p_adults,1),30), b.adults),
         children = case when p_children is null then b.children
                         when array_length(p_children,1) > 20 then b.children
                         else (select coalesce(array_agg(least(greatest(a,0),17)), '{}') from unnest(p_children) a)
                    end,
         interests = case when p_interests is null then b.interests
                          else (select coalesce(array_agg(i), '{}')
                                  from unnest(p_interests) i
                                 where i in ('moto'))
                     end
   where b.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and (b.expires_at is null or b.expires_at > now())
  returning json_build_object('ok', true);
$$;

revoke all on function public.vr_update_party(text, int, int[], text[]) from public;
grant execute on function public.vr_update_party(text, int, int[], text[]) to anon;
